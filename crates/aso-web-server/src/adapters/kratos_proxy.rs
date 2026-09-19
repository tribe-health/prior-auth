use axum::{
    Router,
    body::{Body, to_bytes},
    extract::{OriginalUri, Request, State},
    http::{StatusCode, header},
    response::Response,
    routing::{get, post},
};
use reqwest::{Client, Url, redirect::Policy};

const MAX_FLOW_BODY_BYTES: usize = 256 * 1024;

#[derive(Clone)]
struct KratosProxyState {
    base: Url,
    client: Client,
}

pub fn router(public_url: &str) -> Result<Router, Box<dyn std::error::Error>> {
    let mut base = Url::parse(public_url)?;
    if !base.path().ends_with('/') {
        base.set_path(&format!("{}/", base.path()));
    }
    let state = KratosProxyState {
        base,
        client: Client::builder().redirect(Policy::none()).build()?,
    };
    Ok(Router::new()
        .route("/self-service/login/browser", get(proxy))
        .route("/self-service/login/flows", get(proxy))
        .route("/self-service/login", post(proxy))
        .route("/self-service/recovery/browser", get(proxy))
        .route("/self-service/recovery/flows", get(proxy))
        .route("/self-service/recovery", post(proxy))
        .with_state(state))
}

async fn proxy(
    State(state): State<KratosProxyState>,
    OriginalUri(original_uri): OriginalUri,
    request: Request,
) -> Response {
    let upstream_path = original_uri.path().trim_start_matches('/');
    let mut upstream = match state.base.join(upstream_path) {
        Ok(url) => url,
        Err(_) => return gateway_error(),
    };
    upstream.set_query(original_uri.query());

    let (parts, body) = request.into_parts();
    let body = match to_bytes(body, MAX_FLOW_BODY_BYTES).await {
        Ok(body) => body,
        Err(_) => return status_response(StatusCode::PAYLOAD_TOO_LARGE),
    };
    let mut outgoing = state.client.request(parts.method, upstream).body(body);
    for name in [
        header::ACCEPT,
        header::CONTENT_TYPE,
        header::COOKIE,
        header::ORIGIN,
        header::REFERER,
        header::USER_AGENT,
    ] {
        if let Some(value) = parts.headers.get(&name) {
            outgoing = outgoing.header(name, value);
        }
    }

    let upstream_response = match outgoing.send().await {
        Ok(response) => response,
        Err(_) => return gateway_error(),
    };
    let status = upstream_response.status();
    let headers = upstream_response.headers().clone();
    let body = match upstream_response.bytes().await {
        Ok(body) => body,
        Err(_) => return gateway_error(),
    };
    let mut response = Response::builder().status(status);
    for name in [
        header::CACHE_CONTROL,
        header::CONTENT_TYPE,
        header::LOCATION,
        header::SET_COOKIE,
        header::VARY,
    ] {
        for value in headers.get_all(&name) {
            response = response.header(&name, value);
        }
    }
    response
        .body(Body::from(body))
        .unwrap_or_else(|_| gateway_error())
}

fn gateway_error() -> Response {
    let mut response = status_response(StatusCode::BAD_GATEWAY);
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        "application/json"
            .parse()
            .expect("static content type is valid"),
    );
    *response.body_mut() = Body::from(r#"{"error":"identity_service_unavailable"}"#);
    response
}

fn status_response(status: StatusCode) -> Response {
    let mut response = Response::new(Body::empty());
    *response.status_mut() = status;
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{HeaderMap, HeaderValue};
    use tokio::{net::TcpListener, task::JoinHandle};

    async fn serve(app: Router) -> (String, JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let task = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        (format!("http://{address}"), task)
    }

    async fn login_start() -> (StatusCode, HeaderMap) {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::LOCATION,
            HeaderValue::from_static("http://app.example.test/login?flow=flow-1"),
        );
        headers.append(
            header::SET_COOKIE,
            HeaderValue::from_static("csrf_token=synthetic; Path=/; HttpOnly"),
        );
        headers.append(
            header::SET_COOKIE,
            HeaderValue::from_static("ory_kratos_session=synthetic; Path=/; HttpOnly"),
        );
        (StatusCode::SEE_OTHER, headers)
    }

    #[tokio::test]
    async fn preserves_browser_redirect_and_all_set_cookie_headers() {
        let upstream = Router::new().route("/prefix/self-service/login/browser", get(login_start));
        let (upstream_url, upstream_task) = serve(upstream).await;
        let proxy = router(&format!("{upstream_url}/prefix/")).unwrap();
        let (proxy_url, proxy_task) = serve(proxy).await;
        let client = Client::builder().redirect(Policy::none()).build().unwrap();

        let response = client
            .get(format!(
                "{proxy_url}/self-service/login/browser?return_to=http%3A%2F%2Fapp.example.test%2F"
            ))
            .send()
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::SEE_OTHER);
        assert_eq!(
            response.headers().get(header::LOCATION).unwrap(),
            "http://app.example.test/login?flow=flow-1"
        );
        assert_eq!(
            response
                .headers()
                .get_all(header::SET_COOKIE)
                .iter()
                .count(),
            2
        );

        proxy_task.abort();
        upstream_task.abort();
    }
}

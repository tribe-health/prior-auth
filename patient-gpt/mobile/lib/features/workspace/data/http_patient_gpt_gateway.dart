// TJ-ARCH-MOB-001 compliant
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:patient_gpt/features/workspace/data/wire_codec.dart';
import 'package:patient_gpt/features/workspace/domain/agui_event.dart';
import 'package:patient_gpt/features/workspace/domain/patient_gpt_gateway.dart';
import 'package:patient_gpt/features/workspace/domain/workspace_entities.dart';

/// [PatientGptGateway] over the Axum routes in docs/plan/scaffold-contracts.md.
///
/// Trust boundary: the connection timeout exists so an unreachable service
/// surfaces as an error state instead of an indefinite blank screen.
class HttpPatientGptGateway implements PatientGptGateway {
  HttpPatientGptGateway({required this.baseUri})
    : _client = HttpClient()..connectionTimeout = const Duration(seconds: 5);

  final Uri baseUri;
  final HttpClient _client;

  Uri _uri(String path, [Map<String, String>? query]) =>
      baseUri.replace(path: path, queryParameters: query);

  Future<Object?> _getJson(Uri uri) async {
    final HttpClientResponse res;
    try {
      final req = await _client.getUrl(uri);
      req.headers.set(HttpHeaders.acceptHeader, 'application/json');
      res = await req.close();
    } on SocketException catch (e) {
      throw GatewayUnavailable(endpoint: uri.toString(), detail: e.message);
    } on HttpException catch (e) {
      throw GatewayUnavailable(endpoint: uri.toString(), detail: e.message);
    }
    final body = await res.transform(utf8.decoder).join();
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw GatewayUnavailable(
        endpoint: uri.toString(),
        detail: 'HTTP ${res.statusCode}',
        code: _errorCode(body),
      );
    }
    try {
      return jsonDecode(body);
    } on FormatException catch (e) {
      throw GatewayContractViolation('response is not JSON: ${e.message}');
    }
  }

  /// The `code` of the Axum error body (`{"code", "message"}`), if the body
  /// is that shape. Anything else carries no code.
  static String? _errorCode(String body) {
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map && decoded['code'] is String) {
        return decoded['code'] as String;
      }
    } on FormatException {
      return null;
    }
    return null;
  }

  @override
  Future<Health> health() async =>
      WireCodec.health(await _getJson(_uri('/api/health')));

  @override
  Future<Session> session() async =>
      WireCodec.session(await _getJson(_uri('/api/session')));

  @override
  Future<List<PatientSummary>> listPatients() async =>
      WireCodec.patients(await _getJson(_uri('/api/patients')));

  @override
  Future<List<CaseSummary>> listCases(String patientId) async =>
      WireCodec.cases(
        await _getJson(
          _uri('/api/patients/${Uri.encodeComponent(patientId)}/cases'),
        ),
      );

  @override
  Future<List<ConversationSummary>> listConversations(
    ConversationScope scope,
  ) async => WireCodec.conversations(
    await _getJson(_uri('/api/conversations', {'scope': scope.query})),
  );

  /// POST /api/runs, read as `text/event-stream`. Each event's `data:` lines
  /// are joined and decoded as one AG-UI event.
  @override
  Stream<AguiEvent> startRun(RunRequest request) async* {
    final uri = _uri('/api/runs');
    final HttpClientRequest req;
    final HttpClientResponse res;
    try {
      req = await _client.postUrl(uri);
      req.headers
        ..contentType = ContentType.json
        ..set(HttpHeaders.acceptHeader, 'text/event-stream');
      req.write(jsonEncode(WireCodec.runRequest(request)));
      res = await req.close();
    } on SocketException catch (e) {
      throw GatewayUnavailable(endpoint: uri.toString(), detail: e.message);
    } on HttpException catch (e) {
      throw GatewayUnavailable(endpoint: uri.toString(), detail: e.message);
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw GatewayUnavailable(
        endpoint: uri.toString(),
        detail: 'HTTP ${res.statusCode}',
      );
    }

    final data = <String>[];
    await for (final line
        in res.transform(utf8.decoder).transform(const LineSplitter())) {
      if (line.isEmpty) {
        if (data.isEmpty) continue;
        final payload = data.join('\n');
        data.clear();
        try {
          yield WireCodec.aguiEvent(jsonDecode(payload));
        } on FormatException catch (e) {
          throw GatewayContractViolation('event is not JSON: ${e.message}');
        }
      } else if (line.startsWith('data:')) {
        final v = line.substring(5);
        data.add(v.startsWith(' ') ? v.substring(1) : v);
      }
      // Comment lines (":"), "event:", "id:" and "retry:" carry nothing the
      // contract uses; the event type travels inside the JSON payload.
    }
  }
}

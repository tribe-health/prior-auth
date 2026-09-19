import {
  runMountedLifecycle,
  type BrowserQualificationConfig,
  type MountedLifecycleResult,
} from "./replica-browser-lifecycle";

declare global {
  interface Window {
    __RA11C_CONFIG__?: BrowserQualificationConfig;
    __RA11C_ERROR__?: string;
    __RA11C_LIFECYCLE_RESULT__?: MountedLifecycleResult;
    __RA11C_READY__?: boolean;
    __RA11C_STAGE__?: string;
    __RA11C_START__?: () => void;
  }
}

window.__RA11C_STAGE__ = "lifecycle-ready";
window.__RA11C_READY__ = true;
window.__RA11C_START__ = () => {
  const config = window.__RA11C_CONFIG__;
  if (!config) {
    window.__RA11C_ERROR__ = "mounted lifecycle config is missing";
    return;
  }
  window.__RA11C_STAGE__ = "mounted-session-lifecycle";
  void runMountedLifecycle(config).then((result) => {
    window.__RA11C_LIFECYCLE_RESULT__ = result;
    window.__RA11C_STAGE__ = "complete";
  }).catch((error: unknown) => {
    window.__RA11C_ERROR__ = error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error);
    window.__RA11C_STAGE__ = "failed";
  });
};

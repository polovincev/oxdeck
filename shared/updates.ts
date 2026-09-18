export type UpdateStatus =
  | "disabled"
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

export type UpdateState = {
  status: UpdateStatus;
  currentVersion: string;
  version: string | null;
  progress: number | null;
  message: string;
};

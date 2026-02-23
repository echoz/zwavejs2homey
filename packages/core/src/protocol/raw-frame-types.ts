export interface RawFrame {
  [key: string]: unknown;
}

export interface RawRequestFrame {
  id?: string;
  type: string;
  payload?: unknown;
  [key: string]: unknown;
}

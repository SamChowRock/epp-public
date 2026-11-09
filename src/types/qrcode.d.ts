// Only the server overload used by this Node project. Other overloads target browser canvases.
declare module 'qrcode' {
  const QRCode: { toDataURL(text: string, options: { width: number; margin: number }): Promise<string> };
  export default QRCode;
}

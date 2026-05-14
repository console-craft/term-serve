declare module "qrcode-terminal" {
  type GenerateOptions = {
    small?: boolean
  }

  type QrCodeTerminal = {
    generate(input: string, opts: GenerateOptions, cb: (output: string) => void): void
  }

  const qrcodeTerminal: QrCodeTerminal
  export default qrcodeTerminal
}

export type UrlOpener = (url: string) => Promise<void>;

export function browserCommand(url: string, platform = process.platform): string[] {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);

  switch (platform) {
    case "darwin":
      return ["open", url];
    case "win32":
      return ["rundll32.exe", "url.dll,FileProtocolHandler", url];
    default:
      return ["xdg-open", url];
  }
}

export const openUrlInBrowser: UrlOpener = async (url) => {
  const child = Bun.spawn(browserCommand(url), { stdout: "ignore", stderr: "pipe" });
  const exitCode = await child.exited;
  if (exitCode === 0) return;

  const stderr = (await new Response(child.stderr).text()).trim();
  throw new Error(stderr.length === 0 ? `Browser command exited with code ${exitCode}` : stderr);
};

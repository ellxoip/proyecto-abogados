export function normalizePagaCuotasPortalLink(link: string | null | undefined) {
  if (!link) return null;

  try {
    const url = new URL(link);

    if (url.pathname === "/client/payment") {
      url.pathname = "/client/portal";
      url.search = "";
    }

    if (url.pathname === "/client/auto-login") {
      url.searchParams.delete("pay");
    }

    return url.toString();
  } catch {
    return link;
  }
}

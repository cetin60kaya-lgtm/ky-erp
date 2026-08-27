(() => {
  const API_PREFIX = "https://api.kyerp.net/api";
  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input, init) => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input instanceof Request
            ? input.url
            : String(input || "");

    if (!rawUrl.startsWith(API_PREFIX)) {
      return nativeFetch(input, init);
    }

    const sourceUrl = new URL(rawUrl);
    const localUrl = `${window.location.origin}${sourceUrl.pathname}${sourceUrl.search}${sourceUrl.hash}`;

    if (input instanceof Request) {
      return nativeFetch(new Request(localUrl, input), init);
    }

    return nativeFetch(localUrl, init);
  };
})();

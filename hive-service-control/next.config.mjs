/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { dev }) => {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /node_modules[\\/]bullmq[\\/]dist[\\/]esm[\\/]classes[\\/]child-processor\.js/,
        message: /Critical dependency: the request of a dependency is an expression/,
      },
      {
        module: /node_modules[\\/]jose[\\/]dist[\\/]webapi[\\/]lib[\\/]deflate\.js/,
        message: /A Node\.js API is used \((CompressionStream|DecompressionStream)/,
      },
    ];

    if (dev) {
      // WSL2: excluir directorios de /mnt/d que no son el proyecto
      config.watchOptions = {
        ...config.watchOptions,
        ignored: /(node_modules|\/mnt\/d\/(Turno Facil|turno-facil|turno-facil\.rar|WSL_Backup|WSL_Ubuntu|\$RECYCLE\.BIN|System Volume Information))/,
      };
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" }, // Protege contra Clickjacking (ISO 27001 A.14.1.2)
          { key: "X-Content-Type-Options", value: "nosniff" }, // Previene MIME-sniffing
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" }, // Minimizacion de privilegios
        ],
      },
    ];
  },
};

export default nextConfig;

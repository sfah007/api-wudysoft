import axios from "axios";
import apiConfig from "@/configs/apiConfig";
class CaptchaSolver {
  constructor() {
    this.config = {
      v1: {
        baseUrl: "https://tursite.vercel.app/bypass",
        method: "GET",
        defaultPayload: (url, sitekey) => ({
          url: url,
          sitekey: sitekey
        }),
        extractToken: data => data?.token
      },
      v2: {
        baseUrl: "https://cloudflarebypass.hostrta.win/turnstile",
        method: "GET",
        defaultPayload: (url, sitekey) => ({
          url: url,
          sitekey: sitekey
        }),
        extractToken: data => data?.data?.token
      },
      v3: {
        baseUrl: `https://${apiConfig.DOMAIN_URL}/api/tools/captcha-solver`,
        method: "GET",
        defaultPayload: (url, sitekey) => ({
          url: url,
          sitekey: sitekey
        }),
        extractToken: data => data?.token
      },
      v4: {
        baseUrl: "https://api.gimita.id/api/tools/bypasscf",
        method: "GET",
        defaultPayload: (url, sitekey) => ({
          method: "turnstile-min",
          siteKey: sitekey,
          url: url
        }),
        extractToken: data => data?.data
      },
      v5: {
        baseUrl: "https://fgsi.dpdns.org/api/tools/cfclearance/turnstile-min",
        method: "GET",
        defaultPayload: (url, sitekey) => ({
          apikey: "CircleNBTeam",
          sitekey: sitekey,
          url: url
        }),
        extractToken: data => data?.data?.token
      },
      v6: {
        baseUrl: "https://cf.zenzxz.web.id/solve",
        method: "POST",
        defaultPayload: (url, sitekey) => ({
          url: url,
          siteKey: sitekey,
          mode: "turnstile-min"
        }),
        extractToken: data => data?.data?.token || data?.data?.value || data?.data
      }
    };
    this.bases = ["v1", "v2", "v3", "v4", "v5", "v6"];
  }
  decode(str) {
    try {
      return JSON.parse(Buffer.from(str, "base64").toString());
    } catch {
      return Buffer.from(str, "base64").toString();
    }
  }
  _log(type, message) {
    const prefix = {
      info: "[INFO]",
      start: "[START]",
      success: "[SUCCESS]",
      fail: "[FAIL]",
      retry: "[RETRY]",
      error: "[ERROR]"
    } [type] || "[LOG]";
    console.log(`${prefix} ${message}`);
  }
  async _solveWithBase({
    url,
    sitekey,
    ver,
    act = "turnstile",
    type = "turnstile-min",
    ...rest
  }) {
    const cfg = this.config[ver];
    if (!cfg) {
      this._log("error", `Base tidak dikenal: ${ver}`);
      throw new Error(`Base tidak dikenal: ${ver}`);
    }
    this._log("start", `Mencoba (${ver}) → ${cfg.method} ${cfg.baseUrl}`);
    const startTime = Date.now();
    let apiUrl = cfg.baseUrl;
    try {
      const payload = typeof cfg.defaultPayload === "function" ? cfg.defaultPayload(url, sitekey, type, rest) : {};
      const axiosCfg = {
        method: cfg.method,
        url: apiUrl,
        timeout: 45e3,
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",
          "Content-Type": "application/json"
        }
      };
      if (cfg.method === "GET") {
        axiosCfg.params = payload;
        delete axiosCfg.headers["Content-Type"];
      } else {
        axiosCfg.data = payload;
      }
      const response = await axios(axiosCfg);
      const elapsed = ((Date.now() - startTime) / 1e3).toFixed(2);
      const token = cfg.extractToken(response.data);
      if (token) {
        this._log("success", `berhasil! Token ditemukan (${elapsed}s)`);
        return {
          token: token,
          ver: ver,
          act: type || act,
          elapsed: `${elapsed}s`
        };
      }
      throw new Error(response.data?.message || "Token tidak ditemukan");
    } catch (error) {
      const elapsed = ((Date.now() - startTime) / 1e3).toFixed(2);
      this._log("fail", `gagal [${elapsed}s]: ${error.message}`);
      throw new Error(`[${ver}]: ${error.message}`);
    }
  }
  async solve(params) {
    this._log("info", `Memulai proses solve captcha untuk: ${params.url}`);
    let lastError = null;
    let attempted = 0;
    for (const ver of this.bases) {
      attempted++;
      try {
        const result = await this._solveWithBase({
          ...params,
          ver: ver
        });
        return result;
      } catch (error) {
        lastError = error;
        if (attempted < this.bases.length) {
          this._log("retry", "Gagal, mencoba base berikutnya...");
        }
      }
    }
    throw lastError;
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.sitekey || !params.url) {
    return res.status(400).json({
      error: "sitekey and url are required."
    });
  }
  try {
    const solver = new CaptchaSolver();
    const result = await solver.solve(params);
    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
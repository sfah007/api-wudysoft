import axios from "axios";
import crypto from "crypto";
class Genora {
  constructor() {
    this.key = "AIzaSyD-jXd6isMUTCQuCxq_bBaxOD1M5de2qT8";
    this.pid = "codeai-genora";
    this.tk = null;
    this.uid = null;
    this.api = axios.create({
      timeout: 6e4,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  _log(step, msg) {
    console.log(`[${new Date().toLocaleTimeString()}] [${step}] ${msg}`);
  }
  async _try(fn, label = "Task", attempts = 3) {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (e) {
        this._log("RETRY", `${label} attempt ${i + 1} gagal: ${e.message}`);
        if (i === attempts - 1) throw e;
        await new Promise(r => setTimeout(r, 1e3));
      }
    }
  }
  async solve(input) {
    if (!input) return null;
    try {
      return await this._try(async () => {
        if (Buffer.isBuffer(input)) return input.toString("base64");
        if (typeof input === "string" && input.startsWith("http")) {
          const res = await axios.get(input, {
            responseType: "arraybuffer"
          });
          return Buffer.from(res.data).toString("base64");
        }
        return typeof input === "string" ? input.replace(/^data:image\/\w+;base64,/, "") : input;
      }, "SOLVER");
    } catch (e) {
      this._log("ERROR", `Gagal memproses gambar: ${e.message}`);
      return null;
    }
  }
  async auth() {
    try {
      this._log("AUTH", "Mendaftarkan identitas baru...");
      await this._try(async () => {
        const email = `${crypto.randomBytes(4).toString("hex")}@gmail.com`;
        const pass = crypto.randomBytes(10).toString("hex");
        const {
          data: a
        } = await this.api.post(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${this.key}`, {
          email: email,
          password: pass,
          returnSecureToken: true
        });
        this.tk = a.idToken;
        this.uid = a.localId;
        await this.api.patch(`https://firestore.googleapis.com/v1/projects/${this.pid}/databases/(default)/documents/users/${this.uid}?key=${this.key}`, {
          fields: {
            uid: {
              stringValue: this.uid
            },
            email: {
              stringValue: email
            },
            freeCredits: {
              integerValue: "5"
            },
            createdAt: {
              timestampValue: new Date().toISOString()
            }
          }
        }, {
          headers: {
            Authorization: `Bearer ${this.tk}`
          }
        });
      }, "AUTH_FLOW");
      this._log("AUTH", `Sukses! UID: ${this.uid}`);
    } catch (e) {
      this._log("FATAL", "Auth gagal total.");
      throw e;
    }
  }
  async upd(val = "100") {
    try {
      this._log("CREDIT", `Melakukan refill credit ke ${val}...`);
      await this._try(() => this.api.patch(`https://firestore.googleapis.com/v1/projects/${this.pid}/databases/(default)/documents/users/${this.uid}?updateMask.fieldPaths=freeCredits&key=${this.key}`, {
        fields: {
          freeCredits: {
            integerValue: val
          }
        }
      }, {
        headers: {
          Authorization: `Bearer ${this.tk}`
        }
      }), "REFILL_FLOW");
    } catch (e) {
      this._log("ERROR", "Refill credit gagal.");
    }
  }
  async generate({
    prompt,
    image = [],
    ...rest
  }) {
    try {
      if (!this.tk) await this.auth();
      const imgs = [];
      const items = Array.isArray(image) ? image : image ? [image] : [];
      this._log("PROCESS", `Memproses ${items.length} gambar...`);
      for (const item of items) {
        const b64 = await this.solve(item);
        if (b64) imgs.push(b64);
      }
      const mode = imgs.length > 0 ? "i2i" : "t2i";
      this._log("GENERATE", `Memulai mode ${mode.toUpperCase()}...`);
      const data = await this._try(async () => {
        const res = await this.api.post(`https://us-central1-${this.pid}.cloudfunctions.net/generateImage`, {
          data: {
            prompt: prompt || "High quality digital art",
            images: imgs,
            aspectRatio: rest?.ratio || "1:1",
            ...rest
          }
        }, {
          headers: {
            Authorization: `Bearer ${this.tk}`
          }
        });
        if (!res.data?.result?.success) throw new Error(res.data?.result?.message || "AI Task Gagal");
        return res.data.result;
      }, "AI_GEN");
      this._log("SUCCESS", "Gambar berhasil dibuat.");
      return {
        result: Buffer.from(data.image, "base64"),
        status: true,
        contentType: data.mimeType || "image/png",
        metadata: {
          mode: mode,
          count: imgs.length
        }
      };
    } catch (e) {
      const msg = e.response?.data?.error?.message || e.message || "";
      if (msg.includes("credits") || msg.includes("RESOURCE_EXHAUSTED")) {
        this._log("ALERT", "Saldo habis! Mencoba refill otomatis...");
        await this.upd();
        return await this.gen({
          prompt: prompt,
          image: image,
          ...rest
        });
      }
      this._log("ERROR", `Generate gagal: ${msg}`);
      return {
        result: null,
        status: false,
        error: msg
      };
    }
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.prompt) {
    return res.status(400).json({
      error: "Parameter 'prompt' diperlukan"
    });
  }
  const api = new Genora();
  try {
    const result = await api.generate(params);
    res.setHeader("Content-Type", result.contentType);
    return res.status(200).send(result.result);
  } catch (error) {
    const errorMessage = error.message || "Terjadi kesalahan saat memproses URL";
    return res.status(500).json({
      error: errorMessage
    });
  }
}
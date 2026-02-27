import axios from "axios";
class NanoBanana {
  constructor() {
    this.projectId = "nanobananaproedit";
    this.apiKey = "AIzaSyDAMocDkJwTnUuypjj7t4ZvSo8WWTDDhLg";
    this.region = "us-central1";
    this.dbUrl = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents`;
    this.token = null;
    this.uid = null;
  }
  headers() {
    return {
      Authorization: `Bearer ${this.token || ""}`,
      "Content-Type": "application/json",
      "X-Goog-Api-Key": this.apiKey,
      "X-Android-Package": "com.evolveralab.nanobananaproedit",
      "X-Android-Cert": "61ED377E85D386A8DFEE6B864BD85B0BFAA5AF81"
    };
  }
  async init() {
    try {
      if (this.token) return;
      console.log("[LOG] Authorizing...");
      const auth = await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${this.apiKey}`, {
        returnSecureToken: true
      });
      this.token = auth.data.idToken;
      this.uid = auth.data.localId;
    } catch (e) {
      throw new Error(`Auth failed: ${e.message}`);
    }
  }
  solve(img) {
    if (!img) return null;
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(img)) {
      return `data:image/png;base64,${img.toString("base64")}`;
    }
    if (typeof img === "string") {
      if (img.startsWith("http") || img.startsWith("data:")) return img;
      return `data:image/png;base64,${img}`;
    }
    return null;
  }
  async generate({
    prompt,
    image,
    ...rest
  }) {
    try {
      await this.init();
      const rawInputs = Array.isArray(image) ? image : image ? [image] : [];
      const resolvedImages = rawInputs.map(img => this.solve(img)).filter(Boolean);
      const isEdit = resolvedImages.length > 0;
      const collection = isEdit ? "edit_jobs" : "generate_jobs";
      const fields = {
        userId: {
          stringValue: this.uid
        },
        prompt: {
          stringValue: prompt || ""
        },
        status: {
          stringValue: "queued"
        },
        editCategory: {
          stringValue: rest?.editCategory || (isEdit ? "edit" : "generate")
        },
        resolution: {
          stringValue: rest?.resolution || "1K"
        },
        aspectRatio: {
          stringValue: rest?.aspectRatio || "1:1"
        },
        createdAt: {
          timestampValue: new Date().toISOString()
        },
        updatedAt: {
          timestampValue: new Date().toISOString()
        }
      };
      if (resolvedImages.length === 1) {
        fields.originalImageUrl = {
          stringValue: resolvedImages[0]
        };
      } else if (resolvedImages.length > 1) {
        fields.originalImages = {
          arrayValue: {
            values: resolvedImages.map(url => ({
              stringValue: url
            }))
          }
        };
        fields.originalImageUrl = {
          stringValue: resolvedImages[0]
        };
      }
      console.log(`[LOG] Submitting job to ${collection}...`);
      const res = await axios.post(`${this.dbUrl}/${collection}`, {
        fields: fields
      }, {
        headers: this.headers()
      });
      const jobId = res.data.name.split("/").pop();
      return await this.poll(collection, jobId);
    } catch (e) {
      const errMsg = e.response?.data?.error?.message || e.message;
      return {
        result: null,
        error: errMsg
      };
    }
  }
  async poll(coll, id) {
    for (let i = 0; i < 60; i++) {
      try {
        const res = await axios.get(`${this.dbUrl}/${coll}/${id}`, {
          headers: this.headers()
        });
        const f = res.data.fields || {};
        const status = f.status?.stringValue;
        process.stdout.write(`\r[LOG] Status: ${status || "processing"}...`);
        if (status === "completed") {
          console.log("\n[DONE] Task finished.");
          return {
            result: f.resultImageUrl?.stringValue || f.generatedImageUrl?.stringValue,
            jobId: id,
            info: f
          };
        }
        if (status === "failed") {
          console.log("\n[FAIL] Job failed.");
          return {
            result: null,
            jobId: id,
            error: f.errorMessage?.stringValue || "Unknown error"
          };
        }
      } catch (e) {
        if (e.response?.status !== 404) throw e;
      }
      await new Promise(r => setTimeout(r, 3e3));
    }
    return {
      result: null,
      error: "Timeout"
    };
  }
}
export default async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;
  if (!params.prompt) {
    return res.status(400).json({
      error: "Parameter 'prompt' diperlukan"
    });
  }
  const api = new NanoBanana();
  try {
    const data = await api.generate(params);
    return res.status(200).json(data);
  } catch (error) {
    const errorMessage = error.message || "Terjadi kesalahan saat memproses.";
    return res.status(500).json({
      error: errorMessage
    });
  }
}
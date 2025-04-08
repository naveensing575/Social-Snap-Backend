import express, { Request, Response } from "express";
import cors from "cors";
import youtubedl from "youtube-dl-exec";
import axios from "axios";
import { URL } from "url";

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

interface YtFormat {
  format_id: string;
  ext: string;
  format_note?: string;
  width?: number;
  height?: number;
  acodec?: string;
  vcodec?: string;
  url: string;
}

interface YtPayload {
  title: string;
  thumbnail: string;
  url: string;
  formats?: YtFormat[];
}

function extractCleanYouTubeURL(inputUrl: string): string | null {
  try {
    const url = new URL(inputUrl);
    const videoId = url.searchParams.get("v");
    const timestamp = url.searchParams.get("t");
    if (!videoId) return null;
    let cleanUrl = `https://youtu.be/${videoId}`;
    if (timestamp) cleanUrl += `?t=${timestamp}`;
    return cleanUrl;
  } catch {
    return null;
  }
}

app.post("/api/formats", async (req: Request, res: Response): Promise<void> => {
  let { url } = req.body;
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "Missing URL" });
    return;
  }

  const cleanUrl = extractCleanYouTubeURL(url);
  if (cleanUrl) url = cleanUrl;

  try {
    const result = (await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: ["referer:youtube.com", "user-agent:Mozilla/5.0"],
    })) as unknown as YtPayload;

    const formats = result.formats?.map((f) => ({
      format_id: f.format_id,
      ext: f.ext,
      resolution: f.format_note || `${f.width || 0}x${f.height || 0}`,
      isAudio: f.vcodec === "none" && f.acodec !== "none",
      isVideo: f.vcodec !== "none",
      url: f.url,
    }));

    res.json({
      title: result.title,
      thumbnail: result.thumbnail,
      formats,
    });
  } catch (err) {
    console.error("Error fetching formats", err);
    res.status(500).json({ error: "Failed to retrieve formats." });
  }
});

app.post(
  "/api/download-audio",
  async (req: Request, res: Response): Promise<void> => {
    let { url } = req.body;
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "Missing URL" });
      return;
    }

    const cleanUrl = extractCleanYouTubeURL(url);
    if (cleanUrl) url = cleanUrl;

    try {
      const result = (await youtubedl(url, {
        dumpSingleJson: true,
        extractAudio: true,
        audioFormat: "mp3",
        noCheckCertificates: true,
        preferFreeFormats: true,
      })) as unknown as YtPayload;

      const audioFormat = result.formats?.find(
        (f) => f.vcodec === "none" && f.acodec !== "none" && f.ext === "m4a"
      );

      res.json({
        title: result.title,
        downloadUrl: `/api/stream?videoUrl=${encodeURIComponent(
          audioFormat?.url ?? result.url
        )}&title=${encodeURIComponent(result.title)}`,
      });
    } catch (error) {
      console.error("Error downloading audio:", error);
      res.status(500).json({ error: "Unable to fetch audio." });
    }
  }
);

app.get("/api/stream", async (req: Request, res: Response): Promise<void> => {
  const videoUrl = req.query.videoUrl as string;
  const title = (req.query.title as string) || "video";

  if (!videoUrl) {
    res.status(400).json({ error: "Missing videoUrl parameter" });
    return;
  }

  try {
    const response = await axios.get(videoUrl, { responseType: "stream" });
    const safeTitle = title.replace(/[^a-zA-Z0-9-_]/g, "_");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${safeTitle}.mp4`
    );
    res.setHeader("Content-Type", "video/mp4");
    response.data.pipe(res);
  } catch (err) {
    console.error("Stream error:", err);
    res.status(500).json({ error: "Streaming failed." });
  }
});

app.post(
  "/api/download",
  async (req: Request, res: Response): Promise<void> => {
    let { url } = req.body;
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "Invalid or missing URL." });
      return;
    }

    const cleanUrl = extractCleanYouTubeURL(url);
    if (cleanUrl) url = cleanUrl;

    try {
      const result = (await youtubedl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: ["referer:youtube.com", "user-agent:Mozilla/5.0"],
      })) as unknown as YtPayload;

      const bestFormat = result.formats?.find(
        (f) =>
          f.ext === "mp4" &&
          f.acodec !== "none" &&
          f.vcodec !== "none" &&
          !!f.url
      );

      res.json({
        title: result.title,
        thumbnail: result.thumbnail,
        downloadUrl: `/api/stream?videoUrl=${encodeURIComponent(
          bestFormat?.url ?? result.url
        )}&title=${encodeURIComponent(result.title)}`,
      });
    } catch (error) {
      console.error("Download error:", error);
      res.status(500).json({ error: "Failed to fetch video." });
    }
  }
);

app.listen(PORT, () => {
  console.log(`🚀 Server is running at http://localhost:${PORT}`);
});

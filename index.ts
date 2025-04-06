import express, { Request, Response } from "express";
import cors from "cors";
import youtubedl from "youtube-dl-exec";
import { URL } from "url";

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

interface YtFormat {
  url: string;
  ext: string;
  acodec: string;
  vcodec: string;
}

interface YtPayload {
  title: string;
  thumbnail: string;
  url: string;
  formats?: YtFormat[];
}

function isYtPayload(obj: any): obj is YtPayload {
  return (
    typeof obj === "object" &&
    typeof obj.title === "string" &&
    typeof obj.url === "string"
  );
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

const handleDownload = async (req: Request, res: Response): Promise<void> => {
  let { url } = req.body;

  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "Invalid or missing URL." });
    return;
  }

  const cleanUrl = extractCleanYouTubeURL(url);
  if (cleanUrl) {
    console.log("Original URL:", url);
    console.log("Cleaned URL:", cleanUrl);
    url = cleanUrl;
  }

  try {
    const result = await youtubedl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: ["referer:youtube.com", "user-agent:Mozilla/5.0"],
    });

    if (!isYtPayload(result)) {
      res.status(500).json({ error: "Unexpected response format." });
      return;
    }

    const bestFormat = result.formats?.find(
      (f) =>
        f.ext === "mp4" && f.acodec !== "none" && f.vcodec !== "none" && !!f.url
    );

    res.json({
      title: result.title,
      thumbnail: result.thumbnail,
      downloadUrl: bestFormat?.url ?? result.url,
    });
  } catch (error) {
    console.error("Error fetching download link:", error);
    res.status(500).json({ error: "Failed to fetch video details." });
  }
};

app.post("/api/download", handleDownload);

app.listen(PORT, () => {
  console.log(`🚀 Server is running at http://localhost:${PORT}`);
});

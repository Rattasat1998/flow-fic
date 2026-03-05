import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

type SoundItem = {
  id: string;
  fileName: string;
  label: string;
  url: string;
};

const SOUND_DIRS = ['sound', 'sounds'];
const SUPPORTED_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac']);

async function readSoundDir(publicDir: string, dirName: string): Promise<SoundItem[]> {
  const absoluteDir = path.join(publicDir, dirName);
  let entries: string[] = [];

  try {
    entries = await fs.readdir(absoluteDir);
  } catch {
    return [];
  }

  return entries
    .filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return SUPPORTED_EXTENSIONS.has(ext);
    })
    .map((file) => {
      const url = `/${dirName}/${encodeURIComponent(file)}`;
      return {
        id: `${dirName}/${file}`,
        fileName: file,
        label: '',
        url,
      };
    });
}

export async function GET() {
  try {
    const publicDir = path.join(process.cwd(), 'public');
    const soundsByDir = await Promise.all(
      SOUND_DIRS.map((dirName) => readSoundDir(publicDir, dirName))
    );

    const merged = soundsByDir.flat();
    merged.sort((a, b) => {
      const byName = a.fileName.localeCompare(b.fileName, 'th', { numeric: true, sensitivity: 'base' });
      if (byName !== 0) return byName;
      return a.id.localeCompare(b.id, 'th', { sensitivity: 'base' });
    });
    const items = merged.map((sound, index) => ({
      ...sound,
      label: `เสียงที่ ${index + 1}`,
    }));

    return NextResponse.json(
      { items },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load sound list';
    return NextResponse.json({ error: message, items: [] }, { status: 500 });
  }
}

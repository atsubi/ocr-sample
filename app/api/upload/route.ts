
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();
    if (!image) {
      return NextResponse.json({ error: 'No image data' }, { status: 400 });
    }

    const base64Data = image.replace(/^data:image\/png;base64,/, '');
    const fileName = `processed-${Date.now()}.png`;
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    const filePath = path.join(uploadsDir, fileName);

    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    fs.writeFileSync(filePath, base64Data, 'base64');

    return NextResponse.json({ filePath: `/uploads/${fileName}` });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

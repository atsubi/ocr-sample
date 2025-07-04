
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    console.log("API: Fetching OpenCV.js from external URL...");
    const response = await fetch('https://docs.opencv.org/4.9.0/opencv.js');
    console.log(`API: External fetch response status: ${response.status}, ok: ${response.ok}`);

    if (!response.ok) {
      console.error(`API: Failed to fetch OpenCV.js: ${response.statusText}`);
      throw new Error(`Failed to fetch OpenCV.js: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const headers = new Headers();
    headers.set('Content-Length', arrayBuffer.byteLength.toString());
    console.log(`API: Setting Content-Length header to: ${arrayBuffer.byteLength}`);

    // 必要に応じてCORSヘッダーを追加
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Content-Type', 'application/javascript');

    return new NextResponse(arrayBuffer, { status: response.status, headers });
  } catch (error) {
    console.error('API: Error proxying OpenCV.js:', error);
    return NextResponse.json({ error: 'Failed to load OpenCV.js' }, { status: 500 });
  }
}

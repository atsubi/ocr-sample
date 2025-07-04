'use client';

import { useState, ChangeEvent } from 'react';
import Tesseract from 'tesseract.js';
import { useOpenCv } from './hooks/useOpenCv';

export default function Home() {
  const { cv, isLoaded, progress: cvProgress } = useOpenCv();
  const [image, setImage] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (cv && event.target && typeof event.target.result === 'string') {
          const img = new Image();
          img.onload = () => {
            if (!cv) {
              console.error("OpenCV.js is not loaded yet.");
              return;
            }
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
              tempCanvas.width = img.width;
              tempCanvas.height = img.height;
              tempCtx.drawImage(img, 0, 0, img.width, img.height);
              console.log("Image drawn to temporary canvas.");

              try {
                const src = cv.imread(tempCanvas);
                const dst = new cv.Mat();
                cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
                const displayCanvas = document.createElement('canvas');
                cv.imshow(displayCanvas, dst);
                setImage(displayCanvas.toDataURL('image/png'));
                src.delete();
                dst.delete();
              } catch (e) {
                console.error("Error processing image with OpenCV:", e);
              }
            }
          };
          img.src = event.target.result;
        }
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleRecognize = async () => {
    if (image) {
      setText(null);
      setOcrProgress(0);
      const { data: { text } } = await Tesseract.recognize(
        image,
        'jpn',
        {
          logger: m => {
            if (m.status === 'recognizing text') {
              setOcrProgress(Math.floor(m.progress * 100));
            }
          }
        }
      );
      setText(text);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white shadow-lg rounded-lg p-8">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-8">Tesseract.js OCR</h1>
        <div className="mb-4 text-center">
          {!isLoaded ? (
            <div>
              <p className="text-gray-500">OpenCVを読み込み中... ({cvProgress}%)</p>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${cvProgress}%` }}></div>
              </div>
            </div>
          ) : (
            <p className="text-green-500 font-semibold">OpenCVの準備完了</p>
          )}
        </div>
        <div className="mb-6">
          <label htmlFor="file-upload" className={`cursor-pointer bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg inline-block ${!isLoaded && 'opacity-50 cursor-not-allowed'}`}>
            画像を選択
          </label>
          <input id="file-upload" type="file" className="hidden" onChange={handleFileChange} accept="image/*" disabled={!isLoaded} />
        </div>
        {image && (
          <div className="mb-6 flex justify-center">
            <img src={image} alt="選択した画像" className="max-w-full h-auto rounded-lg shadow-md" />
          </div>
        )}
        <div className="flex justify-center mb-6">
          <button onClick={handleRecognize} disabled={!image || !cv} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed">
            文字を認識
          </button>
        </div>
        {ocrProgress > 0 && ocrProgress < 100 && (
          <div className="w-full bg-gray-200 rounded-full h-4 mb-6">
            <div className="bg-blue-500 h-4 rounded-full" style={{ width: `${ocrProgress}%` }}></div>
          </div>
        )}
        {text && (
          <div className="bg-gray-50 p-6 rounded-lg shadow-inner">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">認識結果:</h2>
            <p className="text-gray-600 whitespace-pre-wrap">{text}</p>
          </div>
        )}
      </div>
    </div>
  );
}
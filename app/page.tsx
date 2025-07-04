
'use client';

import { useState, ChangeEvent, useRef } from 'react';
import Tesseract from 'tesseract.js';
import { useOpenCv } from './hooks/useOpenCv';
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number,
) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  );
}

export default function Home() {
  const { cv, isLoaded, progress } = useOpenCv();
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
  const [croppedImageSrc, setCroppedImageSrc] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);

  const imgRef = useRef<HTMLImageElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [scale, setScale] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [aspect, setAspect] = useState<number | undefined>(undefined);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target && typeof event.target.result === 'string') {
          setOriginalImageSrc(event.target.result);
          setCroppedImageSrc(null); // Reset cropped image
          setText(null); // Reset OCR result
          setCrop(undefined); // Reset crop selection
        }
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (aspect) {
      const { width, height } = e.currentTarget;
      setCrop(centerAspectCrop(width, height, aspect));
    }
  };

  const onCropComplete = (crop: PixelCrop) => {
    setCompletedCrop(crop);
  };

  const onCropChange = (c: Crop) => {
    setCrop(c);
  };

  const handleCropAndProcess = () => {
    if (completedCrop && imgRef.current && previewCanvasRef.current && cv) {
      const image = imgRef.current;
      const canvas = previewCanvasRef.current;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('No 2d context');
      }

      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      canvas.width = completedCrop.width;
      canvas.height = completedCrop.height;

      ctx.drawImage(
        image,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
        0,
        0,
        completedCrop.width,
        completedCrop.height,
      );

      const croppedDataUrl = canvas.toDataURL('image/png');
      setCroppedImageSrc(croppedDataUrl);

      // Process with OpenCV (Grayscale)
      const img = new Image();
      img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          tempCanvas.width = img.width;
          tempCanvas.height = img.height;
          tempCtx.drawImage(img, 0, 0, img.width, img.height);

          try {
            const src = cv.imread(tempCanvas);
            const dst = new cv.Mat();
            cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
            cv.threshold(dst, dst, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
            const displayCanvas = document.createElement('canvas');
            cv.imshow(displayCanvas, dst);
            setCroppedImageSrc(displayCanvas.toDataURL('image/png')); // Update with grayscale image
            src.delete();
            dst.delete();
          } catch (e) {
            console.error("Error processing image with OpenCV:", e);
          }
        }
      };
      img.src = croppedDataUrl;
    }
  };

  const handleRecognize = async () => {
    if (croppedImageSrc) {
      setText(null);
      setOcrProgress(0);
      const { data: { text } } = await Tesseract.recognize(
        croppedImageSrc,
        'jpn',
        {
          logger: m => {
            console.log(m);
            if (m.status === 'recognizing text') {
              setOcrProgress(Math.floor(m.progress * 100));
            }
          }
        }
      );
      setText(text.replace(/\s+/g, ''));
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white shadow-lg rounded-lg p-8">
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-8">Tesseract.js OCR</h1>
        <div className="mb-4 text-center">
          {!isLoaded ? (
            <div>
              <p className="text-gray-500">OpenCVを読み込み中... ({progress}%)</p>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
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

        {originalImageSrc && !croppedImageSrc && (
          <div className="mb-6 flex flex-col items-center">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">画像を切り抜いてください</h2>
            <ReactCrop
              crop={crop}
              onChange={onCropChange}
              onComplete={onCropComplete}
              aspect={aspect}
            >
              <img
                ref={imgRef}
                alt="Crop me"
                src={originalImageSrc}
                style={{ transform: `scale(${scale}) rotate(${rotate}deg)` }}
                onLoad={onImageLoad}
              />
            </ReactCrop>
            <button
              onClick={handleCropAndProcess}
              className="mt-4 bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-6 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
              disabled={!completedCrop?.width || !completedCrop?.height || !cv}
            >
              切り抜いてグレースケール化
            </button>
          </div>
        )}

        {croppedImageSrc && (
          <div className="mb-6 flex justify-center">
            <img src={croppedImageSrc} alt="切り抜き＆グレースケール画像" className="max-w-full h-auto rounded-lg shadow-md" />
          </div>
        )}

        <canvas
          ref={previewCanvasRef}
          style={{
            display: 'none', // Hidden canvas for cropping
          }}
        />

        <div className="flex justify-center mb-6">
          <button onClick={handleRecognize} disabled={!croppedImageSrc || !cv} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed">
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

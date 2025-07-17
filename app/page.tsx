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
  const [processedImageSrc, setProcessedImageSrc] = useState<string | null>(null); // Renamed from croppedImageSrc
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
          setProcessedImageSrc(null); // Reset processed image
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

  // New function to encapsulate OpenCV processing
  const processImageWithOpenCv = async (imageDataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
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
            const src2 = cv.imread(tempCanvas);
            let dst = new cv.Mat();

            cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
            cv.threshold(dst, dst, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
            cv.bitwise_not(dst, dst);

            // Hough Transform for line detection and removal
            let lines = new cv.Mat();
            cv.HoughLinesP(dst, lines, 1, Math.PI / 180, 80, 230, 1); // Parameters from previous step

            // Draw detected lines in red
            for (let i = 0; i < lines.rows; ++i) {
              let x1 = lines.data32S[i * 4];
              let y1 = lines.data32S[i * 4 + 1];
              let x2 = lines.data32S[i * 4 + 2];
              let y2 = lines.data32S[i * 4 + 3];
              console.log("start:", x1, y1, "end:", x2, y2);
              let startPoint = new cv.Point(x1, y1);
              let endPoint = new cv.Point(x2, y2);
              cv.line(src2, startPoint, endPoint, new cv.Scalar(255, 255, 255, 255), 3); // Red, thicker line
            }
            lines.delete(); // Release memory

            const displayCanvas = document.createElement('canvas');
            cv.imshow(displayCanvas, src2);
            const processedDataUrl = displayCanvas.toDataURL('image/png');

            src.delete();
            src2.delete();
            dst.delete();
            
            resolve(processedDataUrl);
          } catch (e) {
            console.error("Error processing image with OpenCV:", e);
            reject(e);
          }
        } else {
          reject(new Error('No 2d context'));
        }
      };
      img.onerror = reject;
      img.src = imageDataUrl;
    });
  };

  const handleCropAndProcess = async () => {
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
      try {
        const result = await processImageWithOpenCv(croppedDataUrl);
        setProcessedImageSrc(result);
      } catch (error) {
        console.error("Failed to process cropped image:", error);
      }
    }
  };

  const handleProcessOriginalImage = async () => {
    if (originalImageSrc && cv) {
      try {
        const result = await processImageWithOpenCv(originalImageSrc);
        setProcessedImageSrc(result);
        setOriginalImageSrc(null); // Hide original image and crop UI after processing
      } catch (error) {
        console.error("Failed to process original image:", error);
      }
    }
  };

  const handleRecognize = async () => {
    if (processedImageSrc) {
      setText(null);
      setOcrProgress(0);
      const { data: { text } } = await Tesseract.recognize(
        processedImageSrc,
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

        {originalImageSrc && !processedImageSrc && (
          <div className="mb-6 flex flex-col items-center">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">画像を切り抜いてください (任意)</h2>
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
            <div className="flex space-x-4 mt-4">
              <button
                onClick={handleCropAndProcess}
                className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-6 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
                disabled={!completedCrop?.width || !completedCrop?.height || !cv}
              >
                切り抜いて処理
              </button>
              <button
                onClick={handleProcessOriginalImage}
                className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
                disabled={!originalImageSrc || !cv}
              >
                元の画像をそのまま処理
              </button>
            </div>
          </div>
        )}

        {processedImageSrc && (
          <div className="mb-6 flex justify-center">
            <img src={processedImageSrc} alt="処理済み画像" className="max-w-full h-auto rounded-lg shadow-md" />
          </div>
        )}

        <canvas
          ref={previewCanvasRef}
          style={{
            display: 'none', // Hidden canvas for cropping
          }}
        />

        <div className="flex justify-center mb-6">
          <button onClick={handleRecognize} disabled={!processedImageSrc || !cv} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed">
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
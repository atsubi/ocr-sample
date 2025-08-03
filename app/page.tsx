'use client';

import { useState, ChangeEvent, useRef, useEffect } from 'react';
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
  const [imageForProcessing, setImageForProcessing] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);

  const imgRef = useRef<HTMLImageElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [scale, setScale] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [threshold, setThreshold] = useState(135);

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
  const processImageWithOpenCv = async (imageDataUrl: string, thresholdValue: number): Promise<string> => {
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
            let dst = new cv.Mat();
            let dst2 = new cv.Mat();

            cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
            cv.cvtColor(src, dst2, cv.COLOR_RGBA2GRAY);

            cv.threshold(dst, dst, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
            cv.threshold(dst2, dst2, thresholdValue, 255, cv.THRESH_BINARY);            
            cv.bitwise_not(dst, dst);

            // Hough Transform for line detection and removal
            let lines = new cv.Mat();
            cv.HoughLinesP(dst, lines, 1, Math.PI / 180, 150, 27, 1); // Parameters from previous step

            // Draw detected lines in white
            for (let i = 0; i < lines.rows; ++i) {
              let x1 = lines.data32S[i * 4];
              let y1 = lines.data32S[i * 4 + 1];
              let x2 = lines.data32S[i * 4 + 2];
              let y2 = lines.data32S[i * 4 + 3];
              console.log("start:", x1, y1, "end:", x2, y2);
              let startPoint = new cv.Point(x1, y1);
              let endPoint = new cv.Point(x2, y2);
              cv.line(dst2, startPoint, endPoint, new cv.Scalar(255, 0, 0, 255), 2); // Red, thicker line
            }
            lines.delete(); // Release memory

            const displayCanvas = document.createElement('canvas');
            cv.imshow(displayCanvas, dst2);
            const processedDataUrl = displayCanvas.toDataURL('image/png');

            src.delete();
            dst.delete();
            dst2.delete();
            
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

      const cropX = completedCrop.x * scaleX;
      const cropY = completedCrop.y * scaleY;
      const cropWidth = completedCrop.width * scaleX;
      const cropHeight = completedCrop.height * scaleY;

      canvas.width = cropWidth;
      canvas.height = cropHeight;

      ctx.drawImage(
        image,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight
      );

      const croppedDataUrl = canvas.toDataURL('image/png');
      setImageForProcessing(croppedDataUrl);
    }
  };

  const handleProcessOriginalImage = async () => {
    if (originalImageSrc && cv) {
      setImageForProcessing(originalImageSrc);
      setOriginalImageSrc(null); // Hide original image and crop UI after processing
    }
  };

  useEffect(() => {
    if (imageForProcessing && cv) {
      processImageWithOpenCv(imageForProcessing, threshold).then(setProcessedImageSrc);
    }
  }, [threshold, imageForProcessing, cv]);

  const handleRecognize = async () => {
    if (processedImageSrc) {
      setText(null);
      setOcrProgress(0);

      const options = {
        /*tessedit_char_whitelist: '★◎' +
          'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん' +
          'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' +
          '一二三四六七八九十百千万億兆円日時分秒年月日' +
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' +
          '0123456789' +
          '!"#$%&\'()*+,-./:;<=>?[\]^_`{|}~ ',*/
        logger: (m: any) => {
          console.log(m);
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.floor(m.progress * 100));
          }
        },
      };

      // @ts-ignore
      const { data: { text } } = await Tesseract.recognize(
        processedImageSrc,
        'jpn',
        options
      );

      setText(text.replace(/\s+/g, ''));
    }
  };

  const handleSaveImage = async () => {
    if (processedImageSrc) {
      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ image: processedImageSrc }),
        });

        if (response.ok) {
          const data = await response.json();
          alert(`画像が保存されました: ${data.filePath}`);
        } else {
          alert('画像の保存に失敗しました。');
        }
      } catch (error) {
        console.error('画像の保存中にエラーが発生しました:', error);
        alert('画像の保存中にエラーが発生しました。');
      }
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
          <>
            <div className="mb-4">
              <label htmlFor="threshold" className="block mb-2 text-sm font-medium text-gray-900">Threshold: {threshold}</label>
              <input
                id="threshold"
                type="range"
                min="0"
                max="255"
                value={threshold}
                onChange={(e) => setThreshold(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            <div className="mb-6 flex justify-center">
              <img src={processedImageSrc} alt="処理済み画像" className="max-w-full h-auto rounded-lg shadow-md" />
            </div>
          </>
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
          <button onClick={handleSaveImage} disabled={!processedImageSrc} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed ml-4">
            画像を保存
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
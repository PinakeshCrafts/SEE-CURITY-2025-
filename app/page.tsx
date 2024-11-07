"use client"

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { beep } from '@/utils/audio';
import { Camera, FlipHorizontal, PersonStanding, Video, Volume2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react'
import { Rings } from 'react-loader-spinner';
import Webcam from 'react-webcam';
import { toast } from "sonner"
import * as cocossd from '@tensorflow-models/coco-ssd'
import "@tensorflow/tfjs-backend-cpu"
import "@tensorflow/tfjs-backend-webgl"
import { DetectedObject, ObjectDetection } from '@tensorflow-models/coco-ssd';
import { drawOnCanvas } from '@/utils/draw';
import { motion } from 'framer-motion';
import { sendEmail } from '@/utils/emailjs';

type Props = {}

let interval: any = null;
let stopTimeout: any = null;
let noPersonDetectedTimeout: any = null;

const HomePage = (props: Props) => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [mirrored, setMirrored] = useState<boolean>(true);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [autoRecordEnabled, setAutoRecordEnabled] = useState<boolean>(false)
  const [volume, setVolume] = useState(0.8);
  const [model, setModel] = useState<ObjectDetection>();
  const [loading, setLoading] = useState(false);
  const [activities, setActivities] = useState<string[]>([]);
  const [lastEmailSent, setLastEmailSent] = useState<number>(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (webcamRef && webcamRef.current) {
      const stream = (webcamRef.current.video as any).captureStream();
      if (stream) {
        mediaRecorderRef.current = new MediaRecorder(stream);

        mediaRecorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0) {
            const recordedBlob = new Blob([e.data], { type: 'video' });
            const videoURL = URL.createObjectURL(recordedBlob);

            const a = document.createElement('a');
            a.href = videoURL;
            a.download = `${formatDate(new Date())}.webm`;
            a.click();
          }
        };
        mediaRecorderRef.current.onstart = (e) => {
          setIsRecording(true);
        }
        mediaRecorderRef.current.onstop = (e) => {
          setIsRecording(false);
        }
      }
    }
  }, [webcamRef])

  useEffect(() => {
    setLoading(true);
    initModel();
  }, [])

  async function initModel() {
    const loadedModel: ObjectDetection = await cocossd.load({
      base: 'lite_mobilenet_v2'
    });
    setModel(loadedModel);
  }

  useEffect(() => {
    if (model) {
      setLoading(false);
    }
  }, [model])

  async function runPrediction() {
    if (
      model
      && webcamRef.current
      && webcamRef.current.video
      && webcamRef.current.video.readyState === 4
    ) {
      const predictions: DetectedObject[] = await model.detect(webcamRef.current.video);

      resizeCanvas(canvasRef, webcamRef);
      drawOnCanvas(mirrored, predictions, canvasRef.current?.getContext('2d'))

      let isPerson: boolean = false;
      if (predictions.length > 0) {
        predictions.forEach((prediction) => {
          isPerson = prediction.class === 'person';
        })

        if (isPerson) {
          if (noPersonDetectedTimeout) {
            clearTimeout(noPersonDetectedTimeout);
            noPersonDetectedTimeout = null;
          }

          if (autoRecordEnabled && !isRecording) {
            startRecording(true);
            const now = Date.now();
            if (now - lastEmailSent > 5 * 60 * 1000) {
              sendEmail(`Person detected at ${formatDate(new Date())}. Auto-recording started.`)
                .then(() => {
                  addActivity(`Email notification sent at ${formatDate(new Date())}`);
                  setLastEmailSent(now);
                })
                .catch((error) => {
                  console.error('Failed to send email:', error);
                  addActivity(`Failed to send email notification at ${formatDate(new Date())}`);
                });
            }
          }
        } else if (isRecording) {
          noPersonDetectedTimeout = setTimeout(() => {
            if (isRecording) {
              stopRecording();
              addActivity(`Auto-record ended due to no person detected at ${formatDate(new Date())}`);
            }
          }, 4000);
        }
      }
    }
  }

  useEffect(() => {
    interval = setInterval(() => {
      runPrediction();
    }, 100)

    return () => clearInterval(interval);
  }, [webcamRef.current, model, mirrored, autoRecordEnabled, runPrediction])

  const addActivity = (activity: string) => {
    setActivities(prev => [activity, ...prev].slice(0, 10)); // Keep only the last 10 activities
  };

  function userPromptScreenshot() {
    if (!webcamRef.current) {
      toast('Camera not found. Please refresh');
    } else {
      const imgSrc = webcamRef.current.getScreenshot();
      console.log(imgSrc);
      const blob = base64toBlob(imgSrc);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${formatDate(new Date())}.png`
      a.click();

      addActivity(`Screenshot captured at ${formatDate(new Date())}`);
    }
  }

  function userPromptRecord() {
    if (!webcamRef.current) {
      toast('Camera is not found. Please refresh.')
    }

    if (mediaRecorderRef.current?.state == 'recording') {
      mediaRecorderRef.current.requestData();
      clearTimeout(stopTimeout);
      mediaRecorderRef.current.stop();
      toast('Recording saved to downloads');
      addActivity(`Video recording saved at ${formatDate(new Date())}`);
    } else {
      startRecording(false);
      addActivity(`Video recording started at ${formatDate(new Date())}`);
    }
  }

  function startRecording(doBeep: boolean) {
    if (webcamRef.current && mediaRecorderRef.current?.state !== 'recording') {
      mediaRecorderRef.current?.start();
      doBeep && beep(volume);

      if (autoRecordEnabled) {
        addActivity(`Auto-record started at ${formatDate(new Date())}`);
      }

      stopTimeout = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.requestData();
          mediaRecorderRef.current.stop();
          addActivity(`Auto-record ended at ${formatDate(new Date())}`);
        }
      }, 30000);
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
      clearTimeout(stopTimeout);
    }
  }

  function toggleAutoRecord() {
    if (autoRecordEnabled) {
      setAutoRecordEnabled(false);
      toast('Autorecord disabled')
      addActivity('Auto-record disabled');
    } else {
      setAutoRecordEnabled(true);
      toast('Autorecord enabled')
      addActivity('Auto-record enabled');
    }
  }

  return (
    <div className='flex flex-col h-screen bg-gray-900 text-white'>
      {/* Navbar */}
      <nav className='bg-black p-4 flex justify-between items-center'>
        <h1 className='text-xl font-bold'>SEE-curity</h1>
      </nav>

      {/* Main content */}
      <div className='flex flex-1 overflow-hidden'>
        {/* Left side - Camera */}
        <motion.div 
          className='w-full lg:w-3/4 flex flex-col'
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className='relative flex-1 rounded-lg overflow-hidden m-4 shadow-lg'>
            <Webcam ref={webcamRef}
              mirrored={mirrored}
              className='h-full w-full object-cover'
            />
            <canvas ref={canvasRef}
              className='absolute top-0 left-0 h-full w-full object-cover'
            ></canvas>
          </div>
          
          {/* Buttons below camera */}
          <motion.div 
            className='p-4 flex justify-center space-x-2'
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            
            <Button variant='secondary' size='icon' onClick={userPromptScreenshot}>
              <Camera />
            </Button>
            <Button variant={isRecording ? 'destructive' : 'secondary'} size='icon' onClick={userPromptRecord}>
              <Video />
            </Button>
            <Button variant={autoRecordEnabled ? 'destructive' : 'secondary'} size='icon' onClick={toggleAutoRecord}>
              {autoRecordEnabled ? <Rings color='white' height={45} /> : <PersonStanding />}
            </Button>
            
          </motion.div>
        </motion.div>

        {/* Right side - Activity Log and UserGuide & Features */}
        <motion.div 
          className='hidden lg:flex lg:w-1/4 flex-col p-4 bg-gray-800 overflow-y-auto'
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          {/* Activity Log */}
          <div className="mb-8">
            <h2 className='text-lg font-semibold mb-4'>Activity Log</h2>
            <div className="text-sm text-gray-300">
              {activities.map((activity, index) => (
                <p key={index} className="mb-2">{activity}</p>
              ))}
            </div>
          </div>

          {/* Separator */}
          <Separator className="bg-gray-700 my-4" />

          {/* UserGuide & Features */}
          <div>
            <h2 className='text-lg font-semibold mb-4'>UserGuide & Features</h2>
            <RenderFeatureHighlightsSection />
          </div>
        </motion.div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className='z-50 absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75'>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <Rings height={100} color='white' />
          </motion.div>
        </div>
      )}
    </div>
  )
}

function RenderFeatureHighlightsSection() {
  return (
    <motion.div 
      className="text-sm text-gray-300"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3, duration: 0.5 }}
    >
      <ul className="space-y-4">
        <li>
          <strong className="text-white">Horizontal Flip ↔</strong>
          <p>Adjust horizontal orientation.</p>
        </li>
        <Separator className="bg-gray-700" />
        <li>
          <strong className="text-white">Take Pictures 📸</strong>
          <p>Capture snapshots at any moment from the video feed.</p>
        </li>
        <li>
          <strong className="text-white">Manual Video Recording 📽</strong>
          <p>Manually record video clips as needed.</p>
        </li>
        <Separator className="bg-gray-700" />
        <li>
          <strong className="text-white">Enable/Disable Auto Record 🚫</strong>
          <p>Option to enable/disable automatic video recording whenever required.</p>
        </li>
        <li>
          <strong className="text-white">Volume Slider 🔊</strong>
          <p>Adjust the volume level of the notifications.</p>
        </li>
        <li>
          <strong className="text-white">Camera Feed Highlighting 🎨</strong>
          <p>
            Highlights persons in <span style={{ color: "#4ade80" }}>green</span> and other objects in{" "}
            <span style={{ color: "#f87171" }}>red</span>.
          </p>
        </li>
      </ul>
    </motion.div>
  )
}

export default HomePage

function resizeCanvas(canvasRef: React.RefObject<HTMLCanvasElement>, webcamRef: React.RefObject<Webcam>) {
  const canvas = canvasRef.current;
  const video = webcamRef.current?.video;

  if ((canvas && video)) {
    const { videoWidth, videoHeight } = video;
    canvas.width = videoWidth;
    canvas.height = videoHeight;
  }
}

function formatDate(d: Date) {
  const formattedDate =
    [
      (d.getMonth() + 1).toString().padStart(2, "0"),
      d.getDate().toString().padStart(2, "0"),
      d.getFullYear(),
    ]
      .join("-") +
    " " +
    [
      d.getHours().toString().padStart(2, "0"),
      d.getMinutes().toString().padStart(2, "0"),
      d.getSeconds().toString().padStart(2, "0"),
    ].join("-");
  return formattedDate;
}

function base64toBlob(base64Data: any) {
  const byteCharacters = atob(base64Data.split(",")[1]);
  const arrayBuffer = new ArrayBuffer(byteCharacters.length);
  const byteArray = new Uint8Array(arrayBuffer);

  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }

  return new Blob([arrayBuffer], { type: "image/png" });
}

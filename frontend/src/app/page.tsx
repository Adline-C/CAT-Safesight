"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface Coordinate {
  x: number;
  y: number;
  bbox?: number[];
  confidence?: number;
}

interface Incident {
  id: number;
  timestamp: string;
  severity: string;
  location: string;
}

interface Detection {
  time_offset?: number;
  severity: string;
  bbox?: number[];
  coordinates?: Coordinate;
  machine_id?: number;
}

// Defined outside to satisfy React 19 / React Compiler purity requirements
let incidentCounter = 1000;
function getNextIncidentId(): number {
  return ++incidentCounter;
}

function getFormattedTimestamp(): string {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

export default function Dashboard() {
  // Coordinates for safety zone
  const [points, setPoints] = useState<Coordinate[]>([]);
  const [isZoneClosed, setIsZoneClosed] = useState(false);
  const [isSpotterActive, setIsSpotterActive] = useState(false);
  const [isIntrusionDetected, setIsIntrusionDetected] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [mobileAlertSent, setMobileAlertSent] = useState(false);
  
  // Tab and image inspection states
  const [activeTab, setActiveTab] = useState<"video" | "image">("video");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isImageAnalyzing, setIsImageAnalyzing] = useState(false);
  
  // Custom Video Uploading & Playback states
  const [uploadedVideo, setUploadedVideo] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoDetections, setVideoDetections] = useState<Detection[]>([]);
  const [activeBboxes, setActiveBboxes] = useState<Detection[]>([]);

  // Form / config inputs
  const [machineId, setMachineId] = useState("CAT-320");
  const [videoPath, setVideoPath] = useState("data/videos/sample.mp4");
  
  // Incident statistics
  const [incidents, setIncidents] = useState<Incident[]>([
    { id: 104, timestamp: "2026-07-17 22:15:30", severity: "HIGH", location: "Excavator-1 Danger Zone" },
    { id: 103, timestamp: "2026-07-17 21:04:12", severity: "HIGH", location: "Excavator-1 Danger Zone" },
  ]);
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoFileInputRef = useRef<HTMLInputElement | null>(null);

  // Redraw the canvas safety zone
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw active bounding boxes (intruders)
    if (activeBboxes.length > 0) {
      // Scale coordinates from original video resolution (we'll scale against standard 1280x720)
      const scaleX = canvas.width / 1280;
      const scaleY = canvas.height / 720;

      activeBboxes.forEach((det) => {
        const bbox = det.bbox || det.coordinates?.bbox;
        if (!bbox || bbox.length < 4) return;
        
        const [x1, y1, x2, y2] = bbox;
        const cx1 = x1 * scaleX;
        const cy1 = y1 * scaleY;
        const cw = (x2 - x1) * scaleX;
        const ch = (y2 - y1) * scaleY;

        const isCrit = det.severity === "CRITICAL";
        const isSafe = det.severity === "SAFE";
        
        ctx.strokeStyle = isSafe 
          ? "#10B981" // Safe Emerald Green
          : isCrit 
            ? "#FF5000" // Alert Red
            : "#FFCD00"; // Safety Yellow

        ctx.lineWidth = 3;
        ctx.strokeRect(cx1, cy1, cw, ch);

        // Fill background for text label
        ctx.fillStyle = isSafe ? "#10B981" : (isCrit ? "#FF5000" : "#FFCD00");
        ctx.font = "bold 10px monospace";
        const label = isSafe ? `PERSON [SAFE]` : `INTRUDER [${det.severity}]`;
        const textWidth = ctx.measureText(label).width;
        
        ctx.fillRect(cx1 - 1.5, cy1 - 18, textWidth + 10, 18);
        ctx.fillStyle = isSafe || isCrit ? "#ffffff" : "#000000";
        ctx.fillText(label, cx1 + 3, cy1 - 5);
      });
    }

    if (points.length === 0) return;
    // Draw lines
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }

    if (isZoneClosed) {
      ctx.closePath();
      // Use flashing Red outline if intrusion is detected, otherwise Safety Yellow
      ctx.strokeStyle = isIntrusionDetected ? "#FF5000" : "#FFCD00";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Semi-transparent fill
      ctx.fillStyle = isIntrusionDetected 
        ? "rgba(255, 80, 0, 0.25)" 
        : "rgba(255, 205, 0, 0.15)";
      ctx.fill();
    } else {
      ctx.strokeStyle = "#FFCD00";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw nodes
    points.forEach((pt, index) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = isIntrusionDetected ? "#FF5000" : "#FFCD00";
      ctx.fill();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label nodes
      ctx.fillStyle = "#ffffff";
      ctx.font = "10px sans-serif";
      ctx.fillText(`P${index + 1}`, pt.x + 8, pt.y + 4);
    });
  }, [points, isZoneClosed, isIntrusionDetected, activeBboxes]);

  // Adjust canvas size to match the parent container size
  const handleResize = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const container = canvas.parentElement;
      if (container) {
        canvas.width = container.clientWidth || 854;
        canvas.height = container.clientHeight || 480;
      }
    }
  };

  useEffect(() => {
    handleResize();
    const timer = setTimeout(handleResize, 300);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timer);
    };
  }, [points, activeTab]);

  const startWebcam = async () => {
    try {
      setUploadedImage(null);
      setImageFile(null);
      setIsWebcamActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      localStreamRef.current = stream;
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      alert("Error accessing webcam: " + err);
      setIsWebcamActive(false);
    }
  };

  const stopWebcam = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setIsWebcamActive(false);
  };

  const snapPhoto = () => {
    const video = webcamVideoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg");
      setUploadedImage(dataUrl);
      
      fetch(dataUrl)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], "webcam_snap.jpg", { type: "image/jpeg" });
          setImageFile(file);
        });
    }
    stopWebcam();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      stopWebcam();
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setUploadedImage(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setVideoDetections([]);
      setActiveBboxes([]);
      setIsIntrusionDetected(false);
      setAlertMessage("Custom video uploaded. Draw your Danger Zone, then click Activate Virtual Spotter.");
      
      const objectUrl = URL.createObjectURL(file);
      setUploadedVideo(objectUrl);
      
      // Auto-load into player
      if (videoRef.current) {
        videoRef.current.src = objectUrl;
        videoRef.current.load();
      }
    }
  };

  const handleTimeUpdate = () => {
    if (videoDetections.length === 0) return;
    const video = videoRef.current;
    if (!video) return;
    const currentTime = video.currentTime;

    // Filter detections matching within 0.35s window
    const matches = videoDetections.filter(
      det => typeof det.time_offset === "number" && Math.abs(det.time_offset - currentTime) <= 0.35
    );

    if (matches.length > 0) {
      setActiveBboxes(matches);
      
      const intrusions = matches.filter(m => m.severity !== "SAFE");
      const safeCount = matches.filter(m => m.severity === "SAFE").length;

      if (intrusions.length > 0) {
        setIsIntrusionDetected(true);
        const highestSev = intrusions.some(m => m.severity === "CRITICAL") ? "CRITICAL" : "HIGH";
        const count = intrusions.length;
        const word = count === 1 ? "Person" : "Personnel";
        const machineName = machineId || "CAT-320";

        setAlertMessage(
          highestSev === "CRITICAL"
            ? `⚠️ CRITICAL DANGER: ${count} ${word} detected inside 30% core zone of ${machineName}!`
            : `⚠️ WARNING: Proximity alert! ${count} ${word} detected near ${machineName} exclusion boundary.`
        );
if (!mobileAlertSent) {
          setMobileAlertSent(true); // Lock it immediately so it doesn't spam
          fetch("https://ntfy.sh/cat-safesight-demo", {
            method: "POST",
            body: `🚨 CAT SafeSight: Video Intrusion detected for asset ${machineName}! [Severity: ${highestSev}]`,
            headers: { "Content-Type": "text/plain" }
          }).catch(err => console.log("Mobile alert broadcast failed:", err));
        }
      } else {
        setIsIntrusionDetected(false);
        const word = safeCount === 1 ? "person" : "people";
        setAlertMessage(`✔️ SAFE: ${safeCount} ${word} tracked outside the danger zone.`);
      }
    } else {
      setActiveBboxes([]);
      setIsIntrusionDetected(false);
      setAlertMessage("Scanning stream... Zone Secure");
    }
  };

  const handleTabChange = (tab: "video" | "image") => {
    setActiveTab(tab);
    resetZone();
    stopWebcam();
  };

  const evaluateImageRisk = async () => {
    if (!isZoneClosed || points.length < 3) {
      alert("Please define a closed Exclusion Danger Zone first.");
      return;
    }
    if (!imageFile) {
      alert("Please upload an image or capture a webcam photo first.");
      return;
    }

    setIsImageAnalyzing(true);
    setAlertMessage("Evaluating image risk factors...");

    const canvas = canvasRef.current;
    if (!canvas) return;

    const scaledPoints = points.map(p => [
      Math.round((p.x / canvas.width) * 1280),
      Math.round((p.y / canvas.height) * 720)
    ]);

    const formData = new FormData();
    formData.append("image", imageFile);
    formData.append("machine_id", machineId.replace(/\D/g, "") || "320");
    formData.append("zone_coordinates", JSON.stringify(scaledPoints));

    try {
      const response = await fetch("http://localhost:8000/api/analyze-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Image analysis endpoint failed");
      const data = await response.json();

      if (data.incidents_detected > 0) {
        setIsIntrusionDetected(true);
        const severity = data.highest_severity;
        
        // Save detections to render boxes
        setActiveBboxes(data.incidents);

        const count = data.incidents_detected;
        const word = count === 1 ? "Person" : "Personnel";
        const machineName = machineId || "CAT-320";

        setAlertMessage(
          severity === "CRITICAL"
            ? `⚠️ CRITICAL: ${count} ${word} detected inside inner 30% area of ${machineName}!`
            : `⚠️ WARNING: ${count} ${word} detected near ${machineName} exclusion boundary.`
        );

        const newInc: Incident = {
          id: getNextIncidentId(),
          timestamp: getFormattedTimestamp(),
          severity: severity,
          location: `Static Photo Proximity: ${severity} Danger`
        };
        setIncidents(prev => [newInc, ...prev]);
      } else {
        setIsIntrusionDetected(false);
        setActiveBboxes(data.incidents || []);
        
        const totalPeople = data.total_persons_detected || 0;
        if (totalPeople > 0) {
          const word = totalPeople === 1 ? "person" : "people";
          setAlertMessage(`✔️ SAFE: ${totalPeople} ${word} detected in frame (outside the exclusion zone).`);
        } else {
          setAlertMessage("Static Image Secure: No personnel detected.");
        }
      }
    } catch (err) {
      console.warn("Failed to contact image analysis backend. Activating simulation fallback.", err);
      setTimeout(() => {
        setIsIntrusionDetected(true);
        const severity = Math.random() > 0.5 ? "CRITICAL" : "MODERATE";
        
        // Generate a simulated bounding box around the center
        const mockBbox = [450, 200, 650, 580];
        setActiveBboxes([{ bbox: mockBbox, severity }]);

        const machineName = machineId || "CAT-320";
        setAlertMessage(
          severity === "CRITICAL"
            ? `⚠️ CRITICAL DANGER (SIMULATED): Person detected near ${machineName} tracks/swing-radius!`
            : `⚠️ WARNING (SIMULATED): Near-miss proximity warning near ${machineName} outer boundary.`
        );

        const mockInc: Incident = {
          id: getNextIncidentId(),
          timestamp: getFormattedTimestamp(),
          severity: severity,
          location: `Simulated Proximity: ${severity} Danger`
        };
        setIncidents(prev => [mockInc, ...prev]);
      }, 1500);
    } finally {
      setIsImageAnalyzing(false);
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isZoneClosed) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newPoints = [...points, { x, y }];
    setPoints(newPoints);

    if (newPoints.length >= 4) {
      setIsZoneClosed(true);
    }
  };

  const resetZone = () => {
    setPoints([]);
    setIsZoneClosed(false);
    setIsIntrusionDetected(false);
    setAlertMessage(null);
  };

const activateVirtualSpotter = async () => {
    if (!isZoneClosed || points.length < 3) {
      alert("Please define a closed Danger Zone on the video first.");
      return;
    }

    setIsSpotterActive(true);
    setAlertMessage("Virtual Spotter Activated. Analyzing video frames...");
    setVideoDetections([]);
    setActiveBboxes([]);

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Scale drawn points to 1280x720 frame bounds
    const scaledPoints = points.map(p => [
      Math.round((p.x / canvas.width) * 1280),
      Math.round((p.y / canvas.height) * 720)
    ]);

    if (videoFile) {
      // 🎥 Real Video Analysis via FastAPI
      const formData = new FormData();
      formData.append("video", videoFile);
      formData.append("machine_id", machineId.replace(/\D/g, "") || "320");
      formData.append("zone_coordinates", JSON.stringify(scaledPoints));

      try {
        const response = await fetch("http://localhost:8000/api/analyze-video-upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) throw new Error("Video analysis endpoint failed");
        const data = await response.json();

        setVideoDetections(data.incidents || []);
        
        // Log individual incidents to state
        if (data.incidents && data.incidents.length > 0) {
          // Group by unique timestamps or display count
          const newInc: Incident = {
            id: getNextIncidentId(),
            timestamp: getFormattedTimestamp(),
            severity: data.highest_severity,
            location: `Video Analysis: ${data.incidents_detected} detections on uploaded feed`
          };
          setIncidents(prev => [newInc, ...prev]);
        }

        // Start video playback
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          videoRef.current.play();
        }
        setAlertMessage(`Analysis Complete. Playing video with real-time detection overlay.`);
      } catch (err) {
        console.error("Failed backend video upload check, falling back to simulated overlay", err);
        alert("Server connection failed. Starting visual simulation fallback.");
        activateSimulatedTimeline();
      } finally {
        setIsSpotterActive(false);
      }
    } else {
      // ⚡ Simulated Time-Synchronized Bounding Box Fallback
      setTimeout(() => {
        setIsSpotterActive(false);
        activateSimulatedTimeline();
      }, 1000);
    }
  };

  const activateSimulatedTimeline = () => {
    // Generate simulated bboxes at specific seconds
    const simulatedData = [
      {
        time_offset: 1.5,
        severity: "HIGH",
        bbox: [320, 200, 480, 550],
        coordinates: { x: 400, y: 550 },
        machine_id: 320
      },
      {
        time_offset: 2.0,
        severity: "HIGH",
        bbox: [330, 210, 490, 560],
        coordinates: { x: 410, y: 560 },
        machine_id: 320
      },
      {
        time_offset: 4.5,
        severity: "CRITICAL",
        bbox: [600, 220, 750, 580],
        coordinates: { x: 675, y: 580 },
        machine_id: 320
      },
      {
        time_offset: 5.0,
        severity: "CRITICAL",
        bbox: [610, 230, 760, 590],
        coordinates: { x: 685, y: 590 },
        machine_id: 320
      },
      {
        time_offset: 7.5,
        severity: "HIGH",
        bbox: [150, 240, 290, 600],
        coordinates: { x: 220, y: 600 },
        machine_id: 320
      }
    ];

    setVideoDetections(simulatedData);

    const mockInc: Incident = {
      id: getNextIncidentId(),
      timestamp: getFormattedTimestamp(),
      severity: "HIGH",
      location: "Exclusion Perimeter Proximity violation"
    };

    setIncidents(prev => [mockInc, ...prev]);

    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
    }
    setAlertMessage("Playback initiated. Scanning stream with simulated overlay...");
  };
const exportPDF = () => {
    const targetMachine = machineId || "CAT-320";
    
    // 1. Map out the dynamic incident table rows
    const logRows = incidents.map(inc => `
      <tr style="border-bottom: 1px solid #3f3f46;">
        <td style="padding: 10px; font-family: monospace; color: #ef4444;">#${inc.id}</td>
        <td style="padding: 10px; font-family: monospace;">${inc.timestamp}</td>
        <td style="padding: 10px; font-weight: 600;">${inc.location}</td>
        <td style="padding: 10px;"><span style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.4); padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">${inc.severity}</span></td>
      </tr>
    `).join("");

    // 2. Create a hidden iframe element
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) return;

    // 3. Inject the styling and structural content directly
    doc.write(`
      <html>
        <head>
          <title>Compliance_Report_${targetMachine}</title>
          <style>
            body { background-color: #000000; color: #f4f4f5; font-family: sans-serif; padding: 40px; }
            .header { border-bottom: 2px solid #ffcd00; padding-bottom: 20px; margin-bottom: 30px; }
            .logo { background: #ffcd00; color: #000000; display: inline-block; padding: 4px 10px; font-weight: 900; border-radius: 4px; margin-bottom: 10px; }
            h1 { margin: 0; font-size: 24px; letter-spacing: 1px; }
            .meta { font-family: monospace; color: #71717a; font-size: 12px; margin-top: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; text-align: left; font-size: 14px; }
            th { border-bottom: 2px solid #27272a; padding: 10px; color: #a1a1aa; font-family: monospace; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">CAT</div>
            <h1>SafeSight Compliance Log</h1>
            <div class="meta">UNIT ID: ${targetMachine} | GENERATED: ${getFormattedTimestamp()}</div>
          </div>
          
          <h3>SYSTEM STATUS: MONITORING LIVE FEEDS</h3>
          <p style="color: #a1a1aa; font-size: 14px;">The following near-miss proximity intrusion incidents were cached during the operational monitoring cycle:</p>
          
          <table>
            <thead>
              <tr>
                <th>INCIDENT ID</th>
                <th>TIMESTAMP</th>
                <th>LOCATION / EVENT</th>
                <th>SEVERITY</th>
              </tr>
            </thead>
            <tbody>
              ${logRows}
            </tbody>
          </table>
          
          <p style="margin-top: 50px; font-size: 11px; color: #71717a; font-family: monospace; text-align: center; border-top: 1px solid #27272a; padding-top: 20px;">
            VERIFIED BY SAFESIGHT DEMO COMPLIANCE ENGINE.
          </p>
        </body>
      </html>
    `);
    doc.close();

    // 4. Trigger print process immediately and clean up the DOM node after
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      document.body.removeChild(iframe);
    }, 500);
  };
 
  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans selection:bg-safety-yellow selection:text-black">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-safety-yellow flex items-center justify-center text-black font-black text-lg">
            CAT
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wider text-white">SafeSight</h1>
            <p className="text-xs text-zinc-500 font-mono">INTELLIGENT BLIND-SPOT MONITORING</p>
          </div>
        </div>

        {/* Global Control Widgets */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 font-mono">UNIT ID:</span>
            <input
              type="text"
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              className="bg-zinc-900 text-white border border-zinc-700 rounded px-2 py-1 text-sm font-bold w-24 focus:outline-none focus:border-safety-yellow text-center"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 font-mono">FEED PATH:</span>
            <input
              type="text"
              value={videoPath}
              onChange={(e) => setVideoPath(e.target.value)}
              className="bg-zinc-900 text-white border border-zinc-700 rounded px-2 py-1 text-sm font-mono w-48 focus:outline-none focus:border-safety-yellow text-center"
            />
          </div>
          <Link
            href="/analytics"
            className="px-3 py-1.5 bg-safety-yellow hover:bg-safety-yellow/90 text-black rounded text-xs font-bold tracking-wide transition-all cursor-pointer"
          >
            Compliance Dashboard
          </Link>
        </div>
      </header>

      {/* Dynamic Top Alert Banner */}
      {alertMessage && (
        <div className={`px-6 py-3 text-center text-sm font-bold flex items-center justify-center gap-2 transition-all duration-300 ${
          isIntrusionDetected 
            ? "bg-alert-red text-white animate-pulse" 
            : "bg-safety-yellow text-black"
        }`}>
          <span>{alertMessage}</span>
        </div>
      )}

      {/* Main Workspace Layout */}
      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Site Feed & Image Inspection (8 Cols) */}
        <section className="lg:col-span-8 flex flex-col gap-4">
          
          {/* Tab Selection */}
          <div className="flex gap-2 border-b border-zinc-800 pb-2">
            <button
              onClick={() => handleTabChange("video")}
              className={`px-4 py-2 text-sm font-bold rounded transition-colors cursor-pointer ${
                activeTab === "video"
                  ? "bg-safety-yellow text-black"
                  : "bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              Live Video Feed
            </button>
            <button
              onClick={() => handleTabChange("image")}
              className={`px-4 py-2 text-sm font-bold rounded transition-colors cursor-pointer ${
                activeTab === "image"
                  ? "bg-safety-yellow text-black"
                  : "bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              Instant Image Inspection
            </button>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-wide flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full bg-safety-yellow ${activeTab === "video" ? "animate-ping" : ""}`}></span>
              {activeTab === "video" ? "LIVE FEED" : "IMAGE ANALYSIS WORKSPACE"}
            </h2>
            <div className="text-xs text-zinc-500 font-mono">
              STATUS: <span className="text-emerald-500 font-bold">ONLINE</span>
            </div>
          </div>

          {/* Tab 2: Control Panel */}
          {activeTab === "image" && (
            <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-855 border-zinc-800 p-3 rounded">
              <span className="text-xs font-mono text-zinc-400 uppercase">Input Source:</span>
              
              {!isWebcamActive ? (
                <button
                  onClick={startWebcam}
                  className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 hover:border-safety-yellow rounded text-xs font-semibold text-white transition-colors cursor-pointer"
                >
                  Activate Webcam
                </button>
              ) : (
                <button
                  onClick={snapPhoto}
                  className="px-3 py-1.5 bg-alert-red text-white hover:brightness-110 rounded text-xs font-semibold transition-all animate-pulse cursor-pointer"
                >
                  📸 Snap Photo
                </button>
              )}

              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 hover:border-safety-yellow rounded text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                Upload Site Photo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />

              {isWebcamActive && (
                <button
                  onClick={stopWebcam}
                  className="px-3 py-1.5 bg-zinc-900 text-zinc-400 hover:text-white rounded text-xs cursor-pointer"
                >
                  Cancel
                </button>
              )}

              {uploadedImage && !isWebcamActive && (
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-mono font-bold ml-auto">
                  IMAGE ACTIVE
                </span>
              )}
            </div>
          )}

          {/* Tab 1: Video Control Panel */}
          {activeTab === "video" && (
            <div className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 p-3 rounded">
              <span className="text-xs font-mono text-zinc-400 uppercase">Input Feed Source:</span>
              
              <button
                onClick={() => videoFileInputRef.current?.click()}
                className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 hover:border-safety-yellow rounded text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                Upload Custom Video
              </button>
              <input
                ref={videoFileInputRef}
                type="file"
                accept="video/*"
                onChange={handleVideoUpload}
                className="hidden"
              />

              {uploadedVideo ? (
                <>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-mono font-bold">
                    CUSTOM VIDEO ACTIVE
                  </span>
                  <button
                    onClick={() => {
                      setUploadedVideo(null);
                      setVideoFile(null);
                      setVideoDetections([]);
                      setActiveBboxes([]);
                      setIsIntrusionDetected(false);
                      setAlertMessage(null);
                      if (videoRef.current) {
                        videoRef.current.src = "/15959637-uhd_3840_2160_60fps.mp4";
                        videoRef.current.load();
                      }
                    }}
                    className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded text-[11px] font-semibold transition-colors cursor-pointer ml-auto"
                  >
                    Reset to Default Stream
                  </button>
                </>
              ) : (
                <span className="text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded font-mono font-semibold">
                  DEFAULT CCTV FEED STREAM
                </span>
              )}
            </div>
          )}

          {/* Video Feed & Canvas Container */}
          <div className="relative aspect-video w-full rounded border border-zinc-800 bg-zinc-950 overflow-hidden group">
            {activeTab === "video" ? (
              /* Layer 1: The Video Background */
              <video
                ref={videoRef}
                src={uploadedVideo || "/15959637-uhd_3840_2160_60fps.mp4"}   
                autoPlay
                loop
                muted
                playsInline
                controls={false}
                onLoadedData={handleResize}
                onLoadedMetadata={handleResize}
                onTimeUpdate={handleTimeUpdate}
                className="absolute inset-0 w-full h-full object-cover opacity-60 z-10"
              />
            ) : (
              /* Image Workspace Layer */
              <>
                {isWebcamActive ? (
                  <video
                    ref={webcamVideoRef}
                    autoPlay
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover opacity-60 z-10"
                  />
                ) : uploadedImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={uploadedImage}
                    className="absolute inset-0 w-full h-full object-cover opacity-60 z-10"
                    alt="Inspection Source"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-10">
                    <span className="text-zinc-500 text-sm font-mono">NO ACTIVE IMAGE SOURCE</span>
                  </div>
                )}
              </>
            )}

            {/* Layer 2: The Clickable Canvas (Sits on top of the background) */}
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              className={`absolute inset-0 cursor-crosshair z-20 w-full h-full ${
                isIntrusionDetected ? "alert-pulse" : ""
              }`}
            />

            {/* Layer 3: Informational Help text overlay */}
            {points.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                <div className="text-center p-6 bg-black/80 rounded border border-zinc-800 max-w-sm backdrop-blur-sm">
                  <p className="text-sm font-bold text-safety-yellow mb-1">SET EXCLUSION ZONE</p>
                  <p className="text-xs text-zinc-400">Click 4 points to define the blind-spot danger boundary.</p>
                </div>
              </div>
            )}
          </div>

          {/* Interactive Spotter Buttons */}
          <div className="flex gap-4">
            {activeTab === "video" ? (
              <button
                onClick={activateVirtualSpotter}
                disabled={isSpotterActive || !isZoneClosed}
                className={`flex-1 font-bold py-3 rounded transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  !isZoneClosed 
                    ? "bg-zinc-800 text-zinc-600 cursor-not-allowed" 
                    : isSpotterActive 
                      ? "bg-safety-yellow/40 text-black cursor-wait" 
                      : "bg-safety-yellow text-black hover:brightness-110"
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                {isSpotterActive ? "SCANNING STREAM..." : "ACTIVATE VIRTUAL SPOTTER"}
              </button>
            ) : (
              <button
                onClick={evaluateImageRisk}
                disabled={isImageAnalyzing || !isZoneClosed || !imageFile}
                className={`flex-1 font-bold py-3 rounded transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  !isZoneClosed || !imageFile
                    ? "bg-zinc-800 text-zinc-600 cursor-not-allowed" 
                    : isImageAnalyzing 
                      ? "bg-safety-yellow/40 text-black cursor-wait" 
                      : "bg-safety-yellow text-black hover:brightness-110"
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                {isImageAnalyzing ? "EVALUATING RISK..." : "EVALUATE IMAGE RISK"}
              </button>
            )}

            <button
              onClick={resetZone}
              className="px-6 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 hover:border-safety-yellow text-white rounded transition-colors font-semibold cursor-pointer"
            >
              RESET ZONE
            </button>
          </div>
        </section>

        {/* Right Column: Live Security Log (4 Cols) */}
        <section className="lg:col-span-4 flex flex-col gap-6">
          {/* Counters Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-950 border border-zinc-800 p-4 rounded text-center">
              <span className="text-xs text-zinc-500 font-mono uppercase block">Total Incidents</span>
              <span className={`text-3xl font-black ${incidents.length > 0 ? "text-alert-red" : "text-white"}`}>
                {incidents.length}
              </span>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 p-4 rounded text-center">
              <span className="text-xs text-zinc-500 font-mono uppercase block">Zone Status</span>
              <span className={`text-sm font-bold uppercase block mt-2 ${
                isIntrusionDetected ? "text-alert-red animate-pulse" : "text-emerald-500"
              }`}>
                {isIntrusionDetected ? "Intrusion" : "Secure"}
              </span>
            </div>
          </div>

          {/* Security Log Table */}
          <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded p-4 flex flex-col gap-4 min-h-[350px]">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold tracking-wider text-zinc-400 font-mono">LIVE INCIDENT STREAM</h3>
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[300px] pr-2 space-y-3">
              {incidents.map((inc) => (
                <div 
                  key={inc.id} 
                  className={`p-3 rounded border border-zinc-800 flex items-start justify-between bg-zinc-900/40 hover:bg-zinc-900 transition-colors ${
                    inc.id === incidents[0].id && isIntrusionDetected ? "border-alert-red/50 bg-alert-red/5" : ""
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-alert-red font-bold font-mono">#{inc.id}</span>
                      <span className="text-xs text-zinc-500 font-mono">{inc.timestamp}</span>
                    </div>
                    <p className="text-xs text-zinc-300 font-semibold mt-1">{inc.location}</p>
                  </div>
                  <span className="text-[10px] bg-alert-red/20 text-alert-red border border-alert-red/40 px-2 py-0.5 rounded font-bold font-mono">
                    {inc.severity}
                  </span>
                </div>
              ))}

              {incidents.length === 0 && (
                <div className="h-full flex items-center justify-center text-zinc-600 text-xs font-mono text-center">
                  NO RECENT LOGGED INCIDENTS.
                </div>
              )}
            </div>

            {/* Export PDF Button */}
            <button
              onClick={exportPDF}
              className="w-full bg-zinc-900 border border-zinc-700 hover:border-safety-yellow hover:bg-zinc-800/80 text-white font-bold py-2.5 rounded transition-all text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4 text-safety-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              EXPORT PDF COMPLIANCE LOG
            </button>
          </div>
        </section>
      </main>
      {/* Footer */}
      <footer className="border-t border-zinc-800 bg-zinc-950 p-4 text-center text-xs text-zinc-600 font-mono">
        © 2026 CAT SAFESIGHT INC. PORTAL VERIFIED BY AI SPOTTER CORE LAYER.
      </footer>
    </div>
  );
}

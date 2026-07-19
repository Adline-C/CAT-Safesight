from datetime import datetime, timezone
from typing import List, Tuple, Dict, Any
import numpy as np
from shapely.geometry import Point, Polygon
from ultralytics import YOLO

# Global model cache to avoid reloading on every frame
_model = None

def get_yolo_model(model_name: str = "yolov8n.pt") -> YOLO:
    global _model
    if _model is None:
        _model = YOLO(model_name)
    return _model

def process_video_frame(
    frame: np.ndarray,
    zone_coordinates: List[Tuple[float, float]],
    machine_id: int = 1
) -> List[Dict[str, Any]]:
    """
    Processes a single video frame to detect persons and check if they are in the danger zone.

    Args:
        frame: The image frame (numpy array) to analyze.
        zone_coordinates: List of (x, y) coordinates defining the danger zone polygon.
        machine_id: The ID of the machinery to associate with any incidents.

    Returns:
        A list of incident payloads for any detected intrusions.
    """
    # 1. Load the pre-trained YOLOv8 model
    model = get_yolo_model()

    # 2. Convert zone coordinates to Shapely Polygon
    if len(zone_coordinates) < 3:
        # A polygon requires at least 3 points
        return []
    
    danger_zone = Polygon(zone_coordinates)
    if not danger_zone.is_valid:
        danger_zone = danger_zone.buffer(0)

    # Run YOLOv8 detection
    results = model(frame, verbose=False)[0]

    incidents = []

    if results.boxes is None:
        return incidents

    for box in results.boxes:
        class_id = int(box.cls[0])
        confidence = float(box.conf[0])

        # Filter for the 'person' class (Class ID 0)
        if class_id == 0:
            # Get bounding box coordinates [x1, y1, x2, y2]
            x1, y1, x2, y2 = box.xyxy[0].tolist()

            # Extracted Coordinate Logic: bottom-center of bounding box
            x_center = (x1 + x2) / 2.0
            y_bottom = y2

            # 3. Perform Point-in-Polygon check
            person_feet = Point(x_center, y_bottom)
            is_intrusion = danger_zone.contains(person_feet) or danger_zone.intersects(person_feet)

            # 4. If intrusion, structure payload
            if is_intrusion:
                incidents.append({
                    "machine_id": machine_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "severity": "High",
                    "coordinates": {
                        "x": x_center,
                        "y": y_bottom,
                        "bbox": [x1, y1, x2, y2],
                        "confidence": confidence
                    }
                })

    return incidents


def process_static_image(
    image_bytes: bytes,
    zone_coordinates: List[Tuple[float, float]],
    machine_id: int = 1
) -> List[Dict[str, Any]]:
    """
    Processes a static image byte stream to detect persons and evaluate custom polygon risk level.
    """
    import numpy as np
    import cv2
    from shapely.affinity import scale

    nparr = np.frombuffer(image_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame is None:
        return []

    model = get_yolo_model()

    if len(zone_coordinates) < 3:
        return []
    
    danger_zone = Polygon(zone_coordinates)
    if not danger_zone.is_valid:
        danger_zone = danger_zone.buffer(0)

    # Scale by ~0.55 horizontally and vertically to represent ~30% interior area (0.55 * 0.55 ≈ 0.3)
    inner_zone = scale(danger_zone, xfact=0.55, yfact=0.55, origin='centroid')
    if not inner_zone.is_valid:
        inner_zone = inner_zone.buffer(0)

    results = model(frame, verbose=False)[0]
    incidents = []

    if results.boxes is None:
        return incidents

    for box in results.boxes:
        class_id = int(box.cls[0])
        confidence = float(box.conf[0])

        if class_id == 0:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            x_center = (x1 + x2) / 2.0
            y_bottom = y2

            person_feet = Point(x_center, y_bottom)
            is_intrusion = danger_zone.contains(person_feet) or danger_zone.intersects(person_feet)

            if is_intrusion:
                is_inner = inner_zone.contains(person_feet) or inner_zone.intersects(person_feet)
                severity = "CRITICAL" if is_inner else "MODERATE"
            else:
                severity = "SAFE"

            incidents.append({
                "machine_id": machine_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "severity": severity,
                "coordinates": {
                    "x": x_center,
                    "y": y_bottom,
                    "bbox": [x1, y1, x2, y2],
                    "confidence": confidence
                }
            })

    return incidents


def process_video_file(
    video_path: str,
    zone_coordinates: List[Tuple[float, float]],
    machine_id: int = 1,
    frame_skip: int = 5
) -> List[Dict[str, Any]]:
    """
    Processes a local video file, runs YOLOv8 person detection on sampled frames,
    verifies danger zone intrusions, and returns a detailed time-based event list.
    """
    import cv2
    from shapely.affinity import scale

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    
    if len(zone_coordinates) < 3:
        cap.release()
        return []

    danger_zone = Polygon(zone_coordinates)
    if not danger_zone.is_valid:
        danger_zone = danger_zone.buffer(0)

    # Inner 30% area for critical danger check
    inner_zone = scale(danger_zone, xfact=0.55, yfact=0.55, origin='centroid')
    if not inner_zone.is_valid:
        inner_zone = inner_zone.buffer(0)

    model = get_yolo_model()
    all_detections = []
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % frame_skip == 0:
            time_offset = round(frame_idx / fps, 2)
            results = model(frame, verbose=False)[0]

            if results.boxes is not None:
                for box in results.boxes:
                    class_id = int(box.cls[0])
                    confidence = float(box.conf[0])

                    if class_id == 0:  # Person
                        x1, y1, x2, y2 = box.xyxy[0].tolist()
                        x_center = (x1 + x2) / 2.0
                        y_bottom = y2

                        person_feet = Point(x_center, y_bottom)
                        is_intrusion = danger_zone.contains(person_feet) or danger_zone.intersects(person_feet)

                        if is_intrusion:
                            is_inner = inner_zone.contains(person_feet) or inner_zone.intersects(person_feet)
                            severity = "CRITICAL" if is_inner else "HIGH"
                        else:
                            severity = "SAFE"

                        all_detections.append({
                            "frame_idx": frame_idx,
                            "time_offset": time_offset,
                            "machine_id": machine_id,
                            "severity": severity,
                            "bbox": [x1, y1, x2, y2],
                            "confidence": confidence,
                            "coordinates": {"x": x_center, "y": y_bottom}
                        })

        frame_idx += 1

    cap.release()
    return all_detections



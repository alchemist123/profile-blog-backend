# Productivity System - API Specification (v1)

This specification defines the REST API endpoints required to power the Frontend Productivity Dashboard. Implementing these endpoints will allow you to replace `localStorage` with a persistent, cross-device database backend.

## Base URL
`base_url: /api/v1/productivity`

---

## 1. Task Management & Time Logger (SYS.Tracker)
Controls the active time tracking and historical task logs.

### `GET /tasks/active`
Retrieves the currently running task, if any.
- **Response (200 OK)**:
  ```json
  {
    "id": "task_123",
    "taskName": "Compile execution binaries",
    "jiraId": "ALPHA-12",
    "projectKey": "ALPHA",
    "workType": "office",
    "startTime": "2026-04-23T10:00:00Z"
  }
  ```
- **Response (204 No Content)**: If no task is active.

### `POST /tasks/start`
Initializes a new time tracking session.
- **Request Body**:
  ```json
  {
    "taskName": "string",
    "jiraId": "string",
    "projectKey": "string",
    "workType": "string (office|personal)"
  }
  ```
- **Response (201 Created)**: Returns the active task object.

### `POST /tasks/{taskId}/stop`
Terminates an active task and saves its duration to historical records.
- **Response (200 OK)**:
  ```json
  {
    "id": "task_123",
    "durationMs": 7200000,
    "endTime": "2026-04-23T12:00:00Z"
  }
  ```

---

## 2. Telemetry & Pulse (SYS.Telemetry)
Fetches aggregated data for the dashboard's circular progress dials.

### `GET /stats`
Retrieves productivity metrics.
- **Query Parameters**: `?period=today` (optional: week, month)
- **Response (200 OK)**:
  ```json
  {
    "tasksExecuted": 12,
    "tasksGoal": 14,
    "deepWorkHours": 4.5,
    "efficiencyRatio": 89
  }
  ```

---

## 3. Operations Queue (SYS.Queue)
Manages the Planning Todo list.

### `GET /queue`
Retrieves the current user's todo items.
- **Response (200 OK)**:
  ```json
  [
    { "id": "q_1", "text": "Run node diagnostics", "done": true },
    { "id": "q_2", "text": "Commit auth patch", "done": false }
  ]
  ```

### `POST /queue`
Enqueues a new item.
- **Request Body**:
  ```json
  { "text": "string" }
  ```

### `PATCH /queue/{itemId}`
Updates queue item state.
- **Request Body**:
  ```json
  { "done": boolean }
  ```

---

## 4. Schedule (SYS.Schedule)
Manages local meetings and calendar nodes.

### `GET /schedule`
Retrieves events.
- **Query Parameters**: `?date=YYYY-MM-DD`
- **Response (200 OK)**:
  ```json
  [
    {
      "id": "evt_1",
      "title": "SYS.Sync",
      "date": "2026-04-23",
      "time": "10:00 AM",
      "type": "Video"
    }
  ]
  ```

### `POST /schedule`
Adds a node to the schedule.
- **Request Body**:
  ```json
  {
    "title": "string",
    "date": "YYYY-MM-DD",
    "time": "string (e.g. 01:30 PM)"
  }
  ```

---

## 5. Dashboard Configuration & Memory
Persists the drag-and-drop structural layout and user-scaled grid dimensions.

### `GET /layout`
Retrieves the saved sizing constraints and rendering order for the widgets.
- **Response (200 OK)**:
  ```json
  {
    "order": ["clock", "task-logger", "stats", "calendar", "planning", "report"],
    "sizes": {
      "clock": { "spanIndex": 0 },
      "task-logger": { "spanIndex": 2 },
      "calendar": { "spanIndex": 1 }
    }
  }
  ```

### `PUT /layout`
Saves the structural memory grid locally.
- **Request Body**: (Same format as `GET /layout` response).

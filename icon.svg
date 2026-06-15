# Backend And Student Analysis Structure

## 1. Roles

| Role | Main responsibility |
| --- | --- |
| Super admin | Full school access, users, courses and operations |
| Academic head | Student health, teacher quality and interventions |
| Teacher | Assigned students, reviews, attendance and help calls |
| Operations | Scheduling, alerts and support follow-up |
| Student | Course, practice uploads, feedback and help calls |
| Parent | Progress summary and approved notifications |

Teachers are restricted to their assigned roster at the API layer.

## 2. Core data

| Area | Tables |
| --- | --- |
| Identity | `users`, `teachers`, `students` |
| Curriculum | `courses`, `course_weeks`, `enrollments` |
| Teaching | `live_sessions`, `help_calls` |
| Practice | `practice_submissions`, `teacher_reviews` |
| Analysis | `skill_ratings`, `progress_snapshots`, `student_alerts` |
| Governance | `audit_logs` |

## 3. Daily workflow

1. Student records a morning or evening 10-minute practice video.
2. A submission record enters the assigned teacher's review queue.
3. The teacher provides one positive observation, one correction and one next
   practice focus.
4. The teacher scores rhythm, accuracy, technique, posture, musicality,
   confidence and feedback application from 1 to 5.
5. The backend recalculates the student health score and alerts.
6. The student immediately sees the reviewed feedback.

## 4. Weekly workflow

1. Two live sessions are scheduled for each student.
2. Attendance is recorded as attended, missed or cancelled.
3. The teacher compares current skill ratings with earlier weeks.
4. The academic head reviews red and amber students.
5. Interventions can include a help call, parent update, course adjustment or
   teacher coaching.

## 5. Analysis rules

The current weighted score is:

```text
overall =
  practice consistency * 0.35 +
  attendance * 0.25 +
  skill ratings * 0.25 +
  feedback application * 0.15
```

Practice consistency compares the previous seven days with the target of 14
uploads. Attendance uses completed sessions from the previous 30 days. Skill
and feedback scores use the ten most recent teacher ratings.

System alerts are generated for:

- Fewer than 10 uploads during the previous seven days
- One or more missed sessions during the previous 14 days
- Practice submissions beyond the teacher's review SLA
- An overall student score below 55

## 6. Admin pages

### Dashboard

- Active student count
- Green, amber and red distribution
- Pending teacher reviews
- Open alerts
- Average review turnaround
- Students requiring attention
- Upcoming live sessions

### Students

- Search by learner, instrument or teacher
- Filter by health status
- Open Student 360

### Student 360

- Four score components and overall score
- Current skill ratings
- Practice submission history
- Session attendance
- Active alerts
- Help-call history
- Parent and course details

### Review queue

- Oldest submission first
- Teacher SLA waiting time
- Written feedback
- Seven skill ratings
- Optional recommendation for an extra help call

### Alerts

- Severity and reason
- Student and assigned teacher
- Resolution tracking

## 7. Production architecture

```text
Student / Parent App
        |
        v
API and authentication
        |
        +--> PostgreSQL: users, courses, progress and analysis
        +--> Private object storage: practice videos
        +--> Queue workers: video processing and notifications
        +--> Meeting provider: live sessions and help calls
        +--> Admin portal: teachers, academic heads and operations
```

The SQLite implementation is suitable for product review and local
development. Before a public launch, move the schema to PostgreSQL, use signed
video upload URLs and add expiring server-side sessions.

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

Teachers are restricted to their assigned roster at the API layer. Students are
restricted to their own data through email OTP login and hashed database-backed
sessions.

There is no public student registration. A Super Admin, Academic Head or
Operations Admin creates the student and registered email first. Only that
active email can request an OTP. Super Admin separately creates and controls
admin and teacher accounts.

## 2. Core data

| Area | Tables |
| --- | --- |
| Identity | `users`, `teachers`, `students` |
| Student login | `student_accounts`, `otp_challenges`, `auth_sessions` |
| Curriculum | `courses`, `course_weeks`, `enrollments` |
| Teaching | `live_sessions`, `help_calls` |
| Practice | `practice_submissions`, `teacher_reviews` |
| Analysis | `skill_ratings`, `progress_snapshots`, `student_alerts` |
| Governance | `audit_logs` |

## 3. Daily workflow

1. Student signs in with registered email and six-digit OTP.
2. Student records a morning or evening practice video of at least seven
   minutes.
3. A submission record enters the assigned teacher's review queue.
4. The teacher provides one positive observation, one correction and one next
   practice focus.
5. The teacher scores rhythm, accuracy, technique, posture, musicality,
   confidence and feedback application from 1 to 5.
6. The backend recalculates the student health score and alerts.
7. The student immediately sees the reviewed feedback.

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

### Staff

- Super Admin only
- Create multiple admins and teachers
- Activate or deactivate staff access
- Prevent teacher deactivation while active students remain assigned

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
Cloudflare Worker: app, API, OTP and authentication
        |
        +--> Neon PostgreSQL: users, OTP sessions and analysis
        +--> Resend: OTP email delivery
        +--> Queue workers: video processing and notifications
        +--> Meeting provider: live sessions and help calls
        +--> Admin portal: teachers, academic heads and operations
```

SQLite remains the local development database. `neon/schema.sql` defines the
production PostgreSQL schema. Resend provides email delivery while OTP
generation and validation stay inside the backend. The first MVP stores
practice check-in metadata without uploading video binaries. Production
secrets stay only in Cloudflare Worker secrets.

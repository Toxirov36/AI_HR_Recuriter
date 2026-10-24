-- Members are either the company administrator or an HR: the Recruiter and Interviewer roles are no longer offered.
-- The enum values stay so older rows and code paths keep working; existing members and pending invitations move to HR.
UPDATE "User" SET "role" = 'HR' WHERE "role" IN ('RECRUITER', 'INTERVIEWER');
UPDATE "Invitation" SET "role" = 'HR' WHERE "role" IN ('RECRUITER', 'INTERVIEWER');

# Security Specification & Dirty Dozen Payloads

## 1. Data Invariants
1. **Default Deny**: Unmatched Firestore paths deny all reads and writes.
2. **Master Gate & Role Integrity**: Subcollections under `/classrooms/{classId}` verify that the parent classroom exists (`exists(...)`) and that write operations strictly match verified user role documents (never trusting client claims or self-assigned `role` updates).
3. **PII Isolation**: `email`, `schoolEmail`, `birthYear`, and `parentPhone` are isolated in `/users/{userId}/private/{docId}` and `/classrooms/{classId}/studentPrivate/{studentId}` and are strictly unreadable by non-owners/non-admins.
4. **Immutable Ownership & Server Timestamps**: `ownerUid`, `createdBy`, `recordedBy`, `authorUid`, and `createdAt` cannot be modified after creation, and timestamps must equal `request.time`.
5. **Strict Key & Size Guards**: Every document enforces `hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` on update, `isValidId()` regex on path variables, and explicit `.size()` bounds on every string.
6. **Secure List Queries**: `allow list` never relies on blanket `isSignedIn()`; private/notification queries restrict `resource.data` to the authenticated `request.auth.uid` or admin.

## 2. Dirty Dozen Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Self-Assigned Admin Role**: Student creates `/users/{uid}` with `role: "teacher"`.
2. **Role Escalation Update**: Student updates their own `/users/{uid}` `role` field from `"student"` to `"monitor"`.
3. **Shadow Ghost Field**: Authenticated user creates a `/posts/{postId}` including an extra `isOfficialVerified: true` field.
4. **Oversized ID Poisoning**: User attempts to write `/classrooms/default/posts/${'a'.repeat(200)}`.
5. **Unverified Email Spoof**: User with `email_verified: false` attempts to write to `/classrooms/default/conductLogs/{id}`.
6. **PII Blanket Read**: Student A attempts `get` on `/classrooms/default/studentPrivate/studentB`.
7. **Author Spoofing**: Monitor creates a `ConductLog` with `recordedBy: "teacher_uid"`.
8. **Timestamp Backdating**: User creates a `ClassPost` with `createdAt` set to a past date instead of `request.time`.
9. **Orphan Subcollection Write**: User writes to `/classrooms/nonexistent_class_999/posts/p1`.
10. **Notification Target Tampering**: Student A attempts to list notifications belonging to `targetUserId: "studentB"`.
11. **Value Type Poisoning**: User updates `DutySchedule.status` to boolean `true` instead of enum string.
12. **Immutable Field Overwrite**: User updates `ConductLog.points` or `createdAt` when unauthorized.

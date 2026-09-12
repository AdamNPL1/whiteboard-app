# Scriboo production end-to-end checklist

Run this checklist against a staging deployment before a public release and after major authentication, sharing, calls, billing, or database changes. Never use production customer accounts or payment details.

## Accounts and email

- Register a new owner account and confirm its email.
- Sign out, sign in again, request a password reset, and complete the reset.
- Enable TOTP MFA, sign out, and sign in with the six-digit code.
- Confirm registration, reset, invitation, billing, deletion, and support emails arrive once and contain the correct staging URL.

## Boards and sharing

- Create a board, add each supported element type, reload, and confirm everything remains.
- Rename, export, trash, restore, and permanently delete a disposable board.
- Invite separate editor and viewer accounts.
- Confirm the editor can edit but cannot perform owner-only actions.
- Confirm the viewer cannot edit, rename, delete, or change sharing.
- Confirm an invitation is single-use, expires, and cannot be accepted by the wrong email address.
- Edit simultaneously in two browsers and verify neither user's changes silently disappear.
- Disconnect one browser, make a change, reconnect, and verify recovery/conflict messaging.

## Calls and devices

- Call owner to editor and editor to owner using two devices or browser profiles.
- Deny camera/microphone access and confirm a useful recovery message appears.
- Disconnect and reconnect the network during a call.
- Change microphone/camera during a call and verify mute, hang-up, and participant state.

## Billing and lifecycle

- Complete a Stripe test-mode checkout and verify the plan changes exactly once.
- Replay a Stripe test webhook and verify it is handled idempotently.
- Export an account and inspect the downloaded data.
- Delete a disposable account and verify it can no longer sign in or access its boards.

## Recovery

- Restore the newest encrypted backup into an empty, disposable Supabase project.
- Confirm expected users, boards, versions, shares, notes, and billing-event records exist.
- Delete the disposable restore project after recording the result and date.

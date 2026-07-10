# Supabase Email Templates

Use these files in the Supabase Dashboard:

1. Open `Authentication`
2. Open `Email Templates`
3. Open `Confirm signup`
4. Replace the default HTML with the contents of `confirm-signup.html`
5. Replace `your-email@example.com` with your real support email
6. Save

The template uses Supabase's built-in variable:

- `{{ .ConfirmationURL }}`

That placeholder must stay exactly as written.

# Google Sheets Form Setup (Apps Script Web App)

Use these steps to connect the live support forms to Google Sheets.

1. Open **Google Sheets** for your form responses, then click **Extensions > Apps Script**.
2. In Apps Script, replace all code in `Code.gs` with the contents of this repo file: `apps-script.gs`.
3. In the script, set `SPREADSHEET_ID` to your target sheet ID (the long ID in the Google Sheets URL).
4. Click **Deploy > New deployment**:
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** and copy the **Web app URL** (the `/exec` URL).
5. In this website codebase, replace every `APPS_SCRIPT_WEB_APP_URL` placeholder with your deployed Web app URL, then redeploy the site.

## Frontend files already wired

- `community-outreach.html`
- `veteran-outreach.html`
- `homeless-outreach.html`
- `crisis-relief.html`
- `app.js`

## Sheet tabs and columns expected by the script

- Need Help:
  `submitted_at, status, name, email, phone, person_needing_help, request, email_opt_in, mailerlite_group, mailerlite_status, internal_notes`
- Veteran Outreach:
  `submitted_at, status, name, email, phone, branch, request, email_opt_in, mailerlite_group, mailerlite_status, internal_notes`
- Homeless Outreach:
  `submitted_at, status, intake_type, name, email, phone, request, email_opt_in, mailerlite_group, mailerlite_status, internal_notes`
- Crisis Relief:
  `submitted_at, status, name, email, phone, city_area, crisis_type, request, email_opt_in, mailerlite_group, mailerlite_status, internal_notes`

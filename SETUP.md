# MailerLite Form Setup (Apps Script Web App)

Use these steps to connect the live support forms directly to MailerLite through Apps Script.

1. Open the existing **Apps Script** project that powers your live form endpoint.
2. In Apps Script, replace all code in `Code.gs` with the contents of this repo file: `apps-script.gs`.
3. In Apps Script, open **Project Settings > Script properties** and add:
   - `MAILERLITE_API_TOKEN` = your MailerLite API token
4. Click **Deploy > Manage deployments** and edit the existing web app deployment, or create a new one:
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** and copy the **Web app URL** (the `/exec` URL).
5. If your website files are still using the same deployed `/exec` URL, no frontend changes are needed. If the Apps Script URL changes, update the `twr-form-endpoint` meta tag values in the site pages.

## Frontend files already wired

- `community-outreach.html`
- `veteran-outreach.html`
- `homeless-outreach.html`
- `crisis-relief.html`
- `app.js`

## MailerLite sync behavior

- `Need Help` submissions are sent server-side to the `Help Requests` MailerLite group.
- `Crisis Relief` submissions are sent server-side to the `Help Requests` MailerLite group.
- All submissions are stored in MailerLite, even when the checkbox is unchecked.
- Unchecked submissions are sent with MailerLite status `unconfirmed`; checked submissions are sent with status `active`.
- The script creates any missing MailerLite custom fields it needs for the intake data.

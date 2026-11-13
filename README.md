# Apna Vyapar — offline-first PWA

## Run

```powershell
npm install
npm run dev
```

Open `http://localhost:5173/`. Build with `npm run build`, then serve `dist/` from a local HTTPS host for installation on Android or iPhone.

The service worker, manifest, React bundle, QR generator, and icons are local. After the first load, the app does not require the internet. UPI QR generation is local; it does not verify or handle payments.

## GitHub Pages

Pushes to `main` deploy automatically through GitHub Actions. The project-site URL is:

`https://krishanh471-create.github.io/Apna-Vyapar/`

In the repository settings, set **Pages → Source** to **GitHub Actions**.

UPI ID and payee name are saved per profile in the catalog database. QR generation creates a profile-scoped pending UPI payment; the owner must tap **Payment received / Mark as paid** after checking their own UPI app. Only paid payments dated in Asia/Kolkata's current day contribute to Today's collection.

## Business isolation

`src/businessTypes.js` is the single source of truth for type-specific modules and labels. A profile is permanently assigned one type. Navigation and page selection use the allowed-module list, and each profile has its own IndexedDB database named `apna-vyapar-<profileId>`. Shared screens still read only the active profile database.

## Security design and limits

- Profile PINs are six digits and are stored as PBKDF2-SHA-256 hashes with 310,000 iterations and a unique salt.
- Five failed logins trigger escalating persisted-in-session lockout. The active session automatically logs out after inactivity.
- PIN reset uses the selected business type plus the registered owner phone and email. The details are checked locally; no SMS, email, cloud service, or profile name is exposed on the login screen.
- Exported backups in this starter build are profile-scoped JSON. Before production use, add passphrase encryption around `exportProfile()` and require PIN re-entry for export, restore, UPI changes, audit viewing, and destructive actions.
- Browser JavaScript cannot protect data from a compromised device, browser extension, developer tools, or an owner who shares the device PIN. Offline email OTP is intentionally not enabled.

## Acceptance smoke test

1. Create Retail, Gym, and Coaching profiles with different six-digit PINs.
2. Log out and log into each profile; verify its menu contains only its configured modules.
3. Add a person/product in one profile, switch profiles, and verify it is absent there.
4. Lock, logout, refresh, and use the back button; a logged-out session must stay on login.
5. Try five incorrect PINs and verify the lockout.
6. Use the owner phone and email to reset a PIN, then log in with the new PIN.
7. Open the dashboard UPI QR, choose ₹50 or ₹100, and scan it in airplane mode. Confirm payment in the owner's UPI app manually.
8. Enter a UPI ID once, close and reopen the QR modal, refresh, and log out/in; the profile's UPI ID and payee name should remain filled.
9. On a member/customer list, filter Active/Suspended/Banned, suspend and reactivate a record, ban and unban it, then permanently delete it by typing its name. Confirm old payment totals remain unchanged.
10. In Retail, add a product, confirm it appears in Billing, and confirm the sidebar has no member, attendance, plan, or batch sections.

## Local data note

Profiles and business records remain in browser IndexedDB on the device. The selected login business type is the only login preference kept in localStorage. No cloud account, SMS provider, email provider, or payment webhook is used by these flows.

## School System

Create a profile with the **School** type to access students, teachers, staff, transportation, hostel, classes/sections, timetable, exams, fees, and salary/payout records. School records use profile-scoped IndexedDB stores. Student QR codes are generated locally and QR scan events are stored locally; QR controls are not shown for teachers, staff, or drivers.

PINs created after this update use bcrypt with a cost factor of 12. Existing PBKDF2 profiles remain readable and are upgraded when their PIN is reset or migrated.

## Salary payment API boundary

The browser never contains Razorpay/Cashfree secret keys. `src/payouts.js` calls a trusted server endpoint configured through `VITE_PAYOUT_API_URL`; that server must authenticate the admin, store provider credentials in server-side environment variables, link the admin payout account, call Razorpay X/Cashfree, and return a payout status/reference. Without that endpoint, the UI records no false success and clearly reports that the payout service is not configured.

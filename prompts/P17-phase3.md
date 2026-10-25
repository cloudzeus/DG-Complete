# P17 — Φάση 3 (επιλέξιμα modules)

Ένα module κάθε φορά. Πριν ξεκινήσεις, γράψε design doc στο `docs/phase3/<module>.md` και ζήτα έγκριση.

## A. Remote browser recorder
Καταγραφή χωρίς extension: Playwright Chromium στον worker, stream με CDP `Page.startScreencast` σε `<canvas>` (WebSocket), forwarding mouse/keyboard, ίδιο pipeline `RecorderEvent`.

## B. Πλήρης αυτόματη επισκευή
Στη βάση του P12: για ροές με ιστορικό σταθερότητας, αυτόματη δημιουργία draft με διορθωμένο locator + αυτόματο test run + ειδοποίηση για έγκριση από Admin.

## C. MCP server
Κάθε μέθοδος συλλογής ως MCP tool (input schema = inputSchema), auth με API key, tools `get_run_status`, `list_failed_runs`. Streamable HTTP.

## D. Προγραμματισμένες εκτελέσεις & triggers
`Schedule` (cron, Europe/Athens) ανά μέθοδο με σταθερό input ή πηγή δεδομένων (αρχείο σε φάκελο Bunny/Synology μέσω WebDAV, email inbox).

## E. Visual change detection
(Για το pilot WWA ένα απλό nightly health run υλοποιείται νωρίτερα — docs/18 §3.) Baseline screenshot ανά βήμα από επιτυχημένα runs· nightly «health run» σε δοκιμαστικό λογαριασμό του πελάτη και σύγκριση → προειδοποίηση πριν σπάσουν οι ροές.

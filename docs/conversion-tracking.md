# Completed conversion tracking

The public site sends these confirmed GA4 events:

- `purchase` after Stripe redirects a completed Checkout Session to the donation thank-you page with a valid Checkout Session ID.
- `generate_lead` after the volunteer form endpoint confirms a successful submission.
- `sign_up` when an embedded MailerLite form displays its success state.

## Stripe Payment Link setup

For every one-time and recurring donation Payment Link, set the post-payment behavior to redirect to:

```text
https://tonightweride.org/donation-thank-you.html?session_id={CHECKOUT_SESSION_ID}
```

The thank-you page records the `purchase` event once per Checkout Session in the visitor's browser. It does not place donor names, email addresses, or payment details in Google Analytics.

Stripe webhooks remain the source of truth for donation fulfillment and accounting. The browser redirect is used only for analytics attribution and the donor thank-you experience.

## GA4 reporting

Use `purchase`, `generate_lead`, and `sign_up` as the completed-conversion events. The existing click and form-attempt events remain useful for funnel analysis but should not be treated as completed outcomes.

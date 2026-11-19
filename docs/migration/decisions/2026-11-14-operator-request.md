# Request to the legacy operator, 2026-11-14

Conventions: [`../README.md`](../README.md). This is the log of the written request to the operator of legacy kvadro²:
service access to the listing API, limits, dump and schema. It belongs to WP-02
([`../wave-1/WP-02-operator-request-and-baseline.md`](../wave-1/WP-02-operator-request-and-baseline.md), Part A).

No key, address, phone number or contact detail is written here: a value is named, never copied.

## Status

| Item | State |
| ---- | ----- |
| Text prepared | 2026-11-14, the WP-02 specification, Part A (with `GET /api/feed/new` added to point 2b, see below) |
| Handed to the product owner | pending: the developer sends or hands over the text of the WP-02 specification, Part A, from the project's own mailbox. The operator's contact is known only to the product owner (Q-SYS-009) |
| Sent to the operator's contact | pending: date and sender (the product owner) to be filled in |
| Text as sent | unchanged from the specification unless pasted below |
| Outbound addresses of the staging and production API hosts | 2026-11-14: asked of the production track in the description of the WP-02 pull request #37 ("Needs from the production track"). The production track gives them to the operator directly; this file only records that they were asked for |
| Addendum (owner-cabinet plan) | 2026-11-20: text prepared in this file, section "Addendum of 2026-11-20"; handed over: pending (the developer hands it over with or after the first request; never from a connected mailbox) |

**Change to the text before sending.** The legacy release `index-DY_DH7h-.js` (the baseline, see
[`../wave-1/baseline.md`](../wave-1/baseline.md)) added `GET /api/feed/new`, which the feed's "new since your last
visit" banner reads. Point 2b therefore also asks for `GET /api/feed/new`.

## Answers

Filled in when the operator answers. Each answer names the question it closes and the specifications it changes
(WP-02 step 6).

| Point | Topic | Answer | Date | Closes | Specifications to change |
| ----- | ----- | ------ | ---- | ------ | ------------------------ |
| 1 | Contact, change notices | — | — | Q-SYS-009 | `24` §8.2; WP-71 |
| 2a–2d | Service key: header, routes, user identity, source addresses | — | — | Q-API-060 | WP-41 |
| 2e | Key rotation and revocation | — | — | Q-SYS-009 | WP-71 |
| 3 | Limits | — | — | Q-API-059 | WP-41, WP-46 |
| 4 | Language and currency, per-user fields | — | — | Q-API-062 | WP-41, WP-42 |
| 5 | Raw values | — | — | Q-API-062 | WP-42 |
| 6 | Source channel and post; author key | — | — | Q-API-063 | WP-42, WP-44 |
| 7 | Phone or call link | — | — | Q-API-062 | WP-43 |
| 8 | Translation target language | — | — | Q-API-062 | WP-43 |
| 9 | Batch read of previews | — | — | RK-25 | WP-42 |
| 10 | Photos: caching, Referer | — | — | — | WP-42 |
| 11 | Landing data files | — | — | — | WP-60 |
| 12 | Dump and schema | — | — | DEC-39 | Wave 2 plan |
| 13 | Announcement in the old bot later | — | — | — | WP-71 |
| 14 | Request route under the service key; `no_chat` | — | — | Q-API-087 | WP-87, WP-41, WP-43 |
| 15 | Per-user identity; the first name; legal basis; retention; erasure | — | — | Q-API-087, Q-API-077, Q-SEC-021 | WP-40, WP-47, WP-56, WP-61, WP-70, WP-87 |
| 16 | Outcome channel, the number on `given`, statuses, expiry | — | — | Q-API-088, Q-API-075 | WP-87, WP-42, WP-43, WP-53 |
| 17 | The owner's view, the realtor report | — | — | Q-API-089, Q-BOT-048 | WP-44, WP-53, WP-87 |
| 18 | Request limits per person or per key | — | — | Q-API-089, Q-API-076, Q-API-059 (extends) | WP-41, WP-85, WP-87 |
| 19 | `blocked`, `harvest` | — | — | Q-API-089, Q-API-076 | WP-85, WP-87, WP-70 |
| 20 | Owner fields in service reads | — | — | Q-API-078, Q-API-062 (extends) | WP-80, WP-42, WP-56 |
| 21 | Change notice; the privacy text final | — | — | Q-SYS-009 (extends) | `24` §8.2, WP-61 |
| 22 | (a) `posted_at` of previews; (b) market medians | — | — | Q-API-083 (a), Q-API-090 (b) | WP-86, WP-84 |
| 23 | The card style of the bot's cards | — | — | Q-API-067, Q-BOT-046 | WP-53, WP-57, WP-31 |
| 24 | The daily limit on opening listings | — | — | Q-API-080, Q-API-059 | WP-40, WP-41, WP-42 |
| 25 | `area_min` / `area_max` for rent | — | — | Q-API-082 | WP-42, WP-45 |
| 26 | The cut of the map answer | — | — | Q-API-015 (then Q-API-086) | WP-42 |
| 27 | The pause | — | — | Q-API-081, Q-BOT-051 | WP-40, WP-41, WP-52 |
| 28 | The radar link `?radar=<id>` | — | — | Q-BOT-050 | WP-52, WP-57 |

## Addendum of 2026-11-20 (owner cabinet and the intakes of 2026-11-19)

Prepared by the owner-cabinet plan; the developer hands it over (Q-SYS-009). Points 14 – 21 supersede points 2
("read-only key") and 2c ("no user identity") for the request route only.

```text
Subject: HOMI — addendum: contact requests to owners on your listings, and seven follow-up points

Hello,

These points continue our request of 14 November (points 1 to 13); if both reach you together,
please read them as one request. Your release of 17 November lets owners place flats
themselves and hide their number behind requests. HOMI shows your listings to HOMI users, and we
would like these users to be able to send such a request too. That needs one write route and a
per-user identity, which our first request said we would avoid; points 14 to 21 explain why and
what we propose. HOMI will also let owners place flats in HOMI itself; those listings stay in HOMI
and need nothing from you, except what point 22 asks. Points 23 to 28 follow your recent releases.
Please answer in writing.

14. Request route. May the service key call POST /api/listings/:id/contact with the body
    {who, people, move_in, message} on behalf of one HOMI user? If yes: the same key or a separate
    key or scope for this write; the same validation as for your app (who values, people 1-20,
    move_in up to 32 characters, message up to 500)? What do you answer in place of 409 no_chat,
    which checks your bot's chat and cannot apply to a HOMI user?

15. User identity. Limits, blocks and request statuses are per person. We propose to send a stable
    opaque id per HOMI user (not the Telegram id) with each such call. Which header and format do
    you accept? Your app tells the owner that he sees the requester's Telegram name. HOMI keeps the
    first name a user has in Telegram with his request and deletes it with the request. Do you need
    a name; if so, may we send that first name with each request, and do you store it? On which
    legal basis do you process it, how long do you keep the request, and will you delete it when
    we tell you that the HOMI user deleted his data?

16. Outcome. How does HOMI learn the owner's answer to a request it sent: (a) my_request on
    GET /api/listings/:id read with the identity of point 15, (b) a callback to an address we give
    you, (c) a status read by a request id returned on creation, or (d) not at all? When the owner
    gives the number, how do we receive it for that user: the phone on the card read with that
    identity, a call link (valid how long), or in the callback? Please define each status (given,
    declined, agent, expired, cancelled), the expiry time, and whether a user may send a new request
    after expired or declined.

17. Owner's side. Will the owner see that the request came through HOMI? Does the owner's answer
    contain anything other than the decision (a text)? How should a HOMI user report that the owner
    turned out to be a realtor? Your bot offers "Ответил риелтор" to your users; is there a route
    for us?

18. Request limits. Your app's texts mention 10 requests a day, 30 a week and a 10-minute pause
    after several in a row. Are these per person (the identity of point 15) or per key? Please give
    the values, the error codes and statuses, and whether a Retry-After is sent. Is there a total
    cap for the key?

19. blocked and harvest. What triggers them, can they be raised against the key as a whole, how
    are we told, and how is a block lifted? We would rather block a single HOMI user on our side
    than lose the route for everyone.

20. Listing fields. Do previews and cards read with the service key carry owner_verified,
    owner_self, contact_mode, response_minutes and owner_description? Is owner_verified always true
    when owner_self is true? Do owner_mine and my_request depend on the identity of point 15? For
    contact_mode "open", is the phone available to the service key as in point 7? Does the server
    prefix the owner label with «Проверенный хозяин» or set it to «Хозяин — со слов объявления»,
    and will a structured value be available instead? Are phone numbers removed from
    owner_description?

21. Changes. These routes and fields are new. Please tell us in advance when they change (as in
    point 1), and tell us when the release of your updated privacy text is final.

22. Publication time and market medians. (a) Your release of 18 November added posted_at to
    previews. Does every preview read with the service key carry it, and in which time zone is it?
    We show the listings HOMI's owners place in HOMI in one list with yours, ordered by that time.
    (b) Can the service key read the median price your listings use for "below market", by city,
    district, number of rooms and deal, with the number of listings it is based on and its date?
    We would use it only to show HOMI's own owner listings against the same market.

23. Card style. Your app lets a user choose how the bot sends listing cards ("Классический" or
    "Новый") and asks the bot for a sample card. What is the "Новый" card at the Bot API level (one
    message with photos and a caption, a media group, or something else), from which Telegram
    version is it shown, and what does a user of an older client receive? What is the default style
    of a new user, and when does the sample answer that nothing was sent?

24. Daily limit. Opening a listing may now answer 429 "too many today". How many listings, over
    which window (a calendar day in Tashkent or 24 hours), and who is counted: the user, the
    address or, for our calls, the service key? If the key is counted, all HOMI users would share
    one limit; can calls with the key be counted per HOMI user (the identity of point 15) instead?
    Do previews count, and is Retry-After sent?

25. Area for rent. Your app now sends area_min and area_max for rent searches too. Does the server
    apply them to rent searches and to rent radars?

26. Map size. GET /api/map may return fewer points than with_point. From how many points is the
    answer cut, and what does "newest" order by?

27. Pause. GET /api/meta may answer 403 paused. Is a pause global or per user, which routes refuse
    during it (also for the service key), and is it announced beforehand? What does your bot do
    while the product is paused?

28. Radar links. Does your bot open the app with ?radar=<id>: from which message, with which button
    text, and with the numeric id that GET /api/subscriptions returns?

Thank you.
```

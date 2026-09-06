# AI Image Prompts — Feature Photos

Generate these with your AI image tool and save into `public/images/ai/` using the
number as the filename (extension can be anything — `.jpg`, `.png`, etc).
Example: `public/images/ai/1.jpg`, `public/images/ai/2.png`, ...

Order matches the feature order on the homepage and features page. Style: real,
warm, natural photos of teachers and students in a Sri Lankan classroom/tuition
setting — NOT app screenshots or UI mockups. No phone screens, no text overlays,
no logos. Think genuine teaching moments, candid and professional, soft daylight.

1. **Student Management** — A friendly teacher standing at the front of a small
   class, calling out names from a register/notebook, students sitting at desks
   looking attentive, warm classroom lighting.

2. **Payment Management** — A teacher at a desk handing a receipt to a parent or
   student, calm and organised tuition office setting, warm tones.

3. **Exam Monitoring** — Students sitting at desks writing an exam on paper,
   focused expressions, teacher walking between rows supervising, bright
   classroom.

4. **Teacher Mobile App** — A teacher standing in a classroom holding a
   smartphone casually in one hand while teaching with the other, smiling,
   engaged with students, natural lighting, phone screen not the focus.

5. **Assistant App** — A young teaching assistant greeting a student at a
   classroom entrance/door, friendly handshake or welcome gesture, relaxed
   daylight setting.

6. **Attendance** — A teacher checking off names on a paper attendance sheet
   while students sit attentively in rows, classroom morning light.

7. **Reports & SMS** — A teacher at a desk reviewing printed reports/papers
   with a thoughtful expression, organised desk, calm productive mood.

8. **Notes & Files** — A teacher handing out printed notes or photocopies to
   students, students reaching to take them, classroom setting.

9. **Class Chat** — A teacher and a student having a friendly conversation
   one-on-one, the student asking a question, warm approachable mood.

10. **Student Portal** — A student studying at home with a laptop or notebook
    open, focused and motivated, cozy home study setting, natural light.

## Wiring notes (for me, after you generate)
Once images exist in `public/images/ai/1.*` through `10.*`, I'll update the
`img` field for each entry in:
- `app/page.tsx` → `featureSlides` array
- `app/features/page.tsx` → `features` array

to point at the matching `/images/ai/N.ext` path, replacing the current reused
`home-img-*.png` placeholders.

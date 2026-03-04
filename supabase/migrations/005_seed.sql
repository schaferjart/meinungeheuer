-- ============================================================
-- Seed: Kleist text excerpt
-- ============================================================
INSERT INTO texts (id, title, content_de, content_en, terms) VALUES (
  'kleist_verfertigung',
  'Über die allmähliche Verfertigung der Gedanken beim Reden',
  'Wenn Du etwas wissen willst und es durch Meditation nicht finden kannst, so rathe ich Dir, mein lieber, sinnreicher Freund, mit dem nächsten Bekannten, der dir aufstößt, darüber zu sprechen. Es braucht nicht eben ein scharfdenkender Kopf zu sein, auch meine ich es nicht so, als ob du ihn darum befragen solltest, nein! Vielmehr sollst Du es ihm selber allererst erzählen. Ich sehe Dich zwar große Augen machen, und mir antworten, man habe Dir in früheren Jahren den Rath gegeben, von nichts zu sprechen, als nur von Dingen, die Du bereits verstehst. Damals aber sprachst Du wahrscheinlich mit dem Vorwitz, Andere, – ich will, daß Du aus der verständigen Absicht sprechest: Dich zu belehren, und so könnten, für verschiedene Fälle verschieden, beide Klugheitsregeln vielleicht gut neben einander bestehen. Der Franzose sagt, l''appétit vient en mangeant, und dieser Erfahrungssatz bleibt wahr, wenn man ihn parodirt, und sagt, l''idée vient en parlant.',
  'If you want to know something and cannot find it through meditation, I advise you, my dear, ingenious friend, to speak about it with the nearest acquaintance you encounter. It need not be a sharp-thinking mind, nor do I mean that you should ask them about it, no! Rather, you should tell them about it yourself first. I can see you making big eyes and answering me that in earlier years you were advised to speak of nothing but things you already understand. But at that time you probably spoke with the presumption of instructing others — I want you to speak with the sensible intention of instructing yourself, and so, for different cases, both rules of prudence might well coexist. The Frenchman says, l''appétit vient en mangeant, and this empirical maxim remains true when one parodies it and says, l''idée vient en parlant.',
  ARRAY['VERFERTIGUNG', 'GEDANKE', 'MEDITATION', 'SPRECHEN', 'BELEHREN']
);

-- ============================================================
-- Seed: Default installation config
-- ============================================================
INSERT INTO installation_config (mode, active_term, active_text_id) VALUES
  ('text_term', NULL, 'kleist_verfertigung');

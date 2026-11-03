-- The product is now called MC Mart. Updates text customers still read; history (audit log,
-- chats, the assistant's past answers) and what shops wrote themselves stay as written.

-- Pages edited in the admin console (links to vreview.app are lowercase, so they don't match).
UPDATE "CmsPage"
SET content = replace(content::text, 'Vreview', 'MC Mart')::jsonb
WHERE content::text LIKE '%Vreview%';

-- This note is translated by its exact text, so it has to match the code.
UPDATE "OrderStatusHistory" SET note = replace(note, 'Vreview', 'MC Mart') WHERE note LIKE '%Vreview%';
UPDATE "ShopOrder" SET "cancelReason" = replace("cancelReason", 'Vreview', 'MC Mart') WHERE "cancelReason" LIKE '%Vreview%';

-- Notifications still in people's inboxes.
UPDATE "Notification"
SET title = replace(title, 'Vreview', 'MC Mart'),
    body = replace(body, 'Vreview', 'MC Mart'),
    data = replace(data::text, 'Vreview', 'MC Mart')::jsonb
WHERE title LIKE '%Vreview%' OR body LIKE '%Vreview%' OR data::text LIKE '%Vreview%';

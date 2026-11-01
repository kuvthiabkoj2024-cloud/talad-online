-- The product is now called Vreview. Updates text customers still read; history (audit log, chats,
-- the assistant's past answers) and what shops wrote themselves stay as written.

-- Pages edited in the admin console: the name and links to the old domain.
UPDATE "CmsPage"
SET content = regexp_replace(regexp_replace(content::text, 'taladonline\.la', 'vreview.app', 'gi'), 'talad ?online', 'Vreview', 'gi')::jsonb
WHERE content::text ~* 'talad ?online';

-- This note is translated by its exact text, so it has to match the code.
UPDATE "OrderStatusHistory" SET note = replace(note, 'Taladonline', 'Vreview') WHERE note LIKE '%Taladonline%';
UPDATE "ShopOrder" SET "cancelReason" = replace("cancelReason", 'Taladonline', 'Vreview') WHERE "cancelReason" LIKE '%Taladonline%';

-- Notifications still in people's inboxes.
UPDATE "Notification"
SET title = replace(title, 'Taladonline', 'Vreview'),
    body = replace(body, 'Taladonline', 'Vreview'),
    data = replace(data::text, 'Taladonline', 'Vreview')::jsonb
WHERE title LIKE '%Taladonline%' OR body LIKE '%Taladonline%' OR data::text LIKE '%Taladonline%';

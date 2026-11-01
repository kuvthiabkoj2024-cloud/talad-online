-- Orders completed before `pointsEarned` was recorded: fill it in where the points can be told
-- apart, so a return can take them back. Points belong to the whole checkout, so only
-- single-shop checkouts qualify.
UPDATE "ShopOrder" so
SET "pointsEarned" = earned.points
FROM (
  SELECT "orderId", SUM(points)::int AS points
  FROM "PointTransaction"
  WHERE type = 'EARN' AND "orderId" IS NOT NULL
  GROUP BY "orderId"
) earned
WHERE so."orderId" = earned."orderId"
  AND so.status = 'COMPLETED'
  AND so."pointsEarned" = 0
  AND (SELECT COUNT(*) FROM "ShopOrder" other WHERE other."orderId" = so."orderId") = 1;

import { SHOP_ORDER_ACTION_NAMES, SHOP_ORDER_TABS, type ShopOrderAction, type ShopOrderTab } from '@talad/shared';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ListShopOrdersQuery {
  @IsOptional()
  @IsIn(Object.keys(SHOP_ORDER_TABS))
  tab?: ShopOrderTab;

  /** Order number, customer name or phone. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize: number = 20;
}

export class ShopOrderActionDto {
  @IsIn(SHOP_ORDER_ACTION_NAMES)
  action: ShopOrderAction;

  /** Required to cancel, reject a payment or reject a return; shown to the customer. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  /** `ship` only. */
  @IsOptional()
  @IsUUID('7')
  deliveryProviderId?: string;

  /** `ship` only. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  trackingNumber?: string;

  /** `ship`: the courier bill photo, from POST /me/shop/orders/:number/bill (required). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  billKey?: string;
}

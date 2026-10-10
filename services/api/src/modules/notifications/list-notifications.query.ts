import { NOTIFICATION_TABS, type NotificationTab } from '@talad/shared';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListNotificationsQuery {
  /** Tab; omitted = all notifications. */
  @IsOptional()
  @IsIn(Object.keys(NOTIFICATION_TABS))
  tab?: NotificationTab;

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

export class ReadAllQuery {
  /** Only mark this tab's notifications; omitted = all. */
  @IsOptional()
  @IsIn(Object.keys(NOTIFICATION_TABS))
  tab?: NotificationTab;
}

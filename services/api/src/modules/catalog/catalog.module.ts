import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CmsModule } from '../cms/cms.module.js';
import { MediaModule } from '../media/media.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PromotionsModule } from '../promotions/promotions.module.js';
import { AdminProductsController } from './products/admin-products.controller.js';
import { AdminProductsService } from './products/admin-products.service.js';
import { AdminCatalogController } from './admin-catalog.controller.js';
import { AdminCatalogService } from './admin-catalog.service.js';
import { AdminCommissionController, ShopCommissionController } from './commission/commission-requests.controller.js';
import { CommissionRequestsService } from './commission/commission-requests.service.js';
import { CategoriesController } from './categories/categories.controller.js';
import { CategoriesService } from './categories/categories.service.js';
import { ChatController } from './chat/chat.controller.js';
import { ChatService } from './chat/chat.service.js';
import { AnthropicService } from '../ai/anthropic.service.js';
import { ClipService } from './image-search/clip.service.js';
import { ImageIndexService } from './image-search/image-index.service.js';
import { PhotoSearchController } from './image-search/photo-search.controller.js';
import { PhotoSearchService } from './image-search/photo-search.service.js';
import { VisionKeywordsService } from './image-search/vision-keywords.service.js';
import { ProductsController } from './products/products.controller.js';
import { ProductsService } from './products/products.service.js';
import { ShopProductsController } from './products/shop-products.controller.js';
import { ShopProductsService } from './products/shop-products.service.js';
import { UnitsController } from './units.controller.js';
import { FeedPostsController, MyFeedPostsController } from './videos/feed-posts.controller.js';
import { FeedPostsService } from './videos/feed-posts.service.js';
import { VideoEngagementService } from './videos/video-engagement.service.js';
import { MyVideosController, ShopVideosController, VideosController } from './videos/videos.controller.js';
import { MyProfileFollowsController, ProfilesController } from './videos/profiles.controller.js';
import { ProfilesService } from './videos/profiles.service.js';

/** Categories, units, products, variants and moderation (§2.5, §2.6, §3.3). */
@Module({
  imports: [AuthModule, CmsModule, MediaModule, PromotionsModule, NotificationsModule, OrdersModule],
  controllers: [ChatController, PhotoSearchController, CategoriesController, UnitsController, ProductsController, ShopProductsController, AdminProductsController, AdminCatalogController, VideosController, MyVideosController, ShopVideosController, FeedPostsController, MyFeedPostsController, ProfilesController, MyProfileFollowsController, ShopCommissionController, AdminCommissionController],
  providers: [
    CommissionRequestsService,
    CategoriesService,
    ProductsService,
    ShopProductsService,
    AdminProductsService,
    AdminCatalogService,
    ClipService,
    ImageIndexService,
    VisionKeywordsService,
    PhotoSearchService,
    AnthropicService,
    ChatService,
    VideoEngagementService,
    FeedPostsService,
    ProfilesService,
  ],
  exports: [CategoriesService, ProductsService, PhotoSearchService, AnthropicService],
})
export class CatalogModule {}

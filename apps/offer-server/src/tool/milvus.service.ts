import { OpenAIEmbeddings } from '@langchain/openai';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsService } from './embeddings.service';
import { Milvus } from '@langchain/community/vectorstores/milvus';

@Injectable()
export class MilvusService implements OnModuleInit {
  embeddings: OpenAIEmbeddings;
  milvus: Milvus;
  DB_NAME: string;
  logger;
  private milvusConfig: any;

  constructor(
    @Inject(EmbeddingsService) private embeddingsService: EmbeddingsService,
    private configService: ConfigService,
  ) {
    // 构造函数只做同步的赋值，不做异步操作
    this.embeddings = this.embeddingsService.getEmbeddings();
    this.DB_NAME = this.configService.get('MILVUS_DATABASE') || 'default';
    this.logger = new Logger(MilvusService.name);
    // 预先提取配置存起来
    this.milvusConfig = {
      collectionName:
        this.configService.get('MILVUS_COLLECTION_NAME') || 'offer_collection',
      username: this.configService.get('MILVUS_USERNAME'),
      password: this.configService.get('MILVUS_PASSWORD'),
      clientConfig: {
        address: this.configService.get('MILVUS_URL') || 'localhost:19530',
      },
      ssl: false,
      textField: 'content',
      textFieldMaxLength: 4000,
      primaryField: 'id',
      vectorField: 'vector',
      indexCreateOptions: {
        metric_type: (this.configService.get('MILVUS_METRIC_TYPE') ||
          'COSINE') as 'L2' | 'IP' | 'COSINE',
        index_type: this.configService.get('MILVUS_INDEX_TYPE') as any,
        params: { M: 16, efConstruction: 200 },
        search_params: { ef: 64 },
      },
    };
  }

  async onModuleInit() {
    await this.initMilvus();
  }
  // 初始化 Milvus 数据库
  private async initMilvus() {
    try {
      const tempMilvus = new Milvus(this.embeddings, {
        ...this.milvusConfig,
        clientConfig: {
          ...this.milvusConfig.clientConfig,
          database: undefined,
        },
      });

      const { db_names } = await tempMilvus.client.listDatabases();
      const dbExists = db_names.find((db: string) => db === this.DB_NAME);

      if (!dbExists) {
        this.logger.log(`数据库 ${this.DB_NAME} 不存在，正在创建...`);
        await tempMilvus.client.createDatabase({ db_name: this.DB_NAME });
        this.logger.log(`数据库 ${this.DB_NAME} 创建成功`);
      } else {
        this.logger.log(`数据库 ${this.DB_NAME} 已存在`);
      }

      await tempMilvus.client.useDatabase({ db_name: this.DB_NAME });
      this.logger.log(`已切换到数据库：${this.DB_NAME}`);

      const collectionName = this.milvusConfig.collectionName;
      const hasColResp = await tempMilvus.client.hasCollection({
        collection_name: collectionName,
      });

      if (hasColResp.value) {
        const descResp = await tempMilvus.client.describeCollection({
          collection_name: collectionName,
        });
        const textFieldDef = descResp.schema.fields.find(
          (f: any) => f.name === this.milvusConfig.textField,
        );
        const currentMaxLength = Number(
          textFieldDef?.type_params?.find((p: any) => p.key === 'max_length')
            ?.value ?? 0,
        );

        if (
          currentMaxLength > 0 &&
          currentMaxLength < this.milvusConfig.textFieldMaxLength
        ) {
          this.logger.warn(
            `集合 ${collectionName} 的 ${this.milvusConfig.textField} 字段 max_length=${currentMaxLength}，小于配置的 ${this.milvusConfig.textFieldMaxLength}，正在重建...`,
          );
          await tempMilvus.client.dropCollection({
            collection_name: collectionName,
          });
          this.logger.log(
            `集合 ${collectionName} 已删除，将在首次写入时按新配置重新创建`,
          );
        } else {
          this.logger.log(`集合 ${collectionName} 已存在，保留已有数据不删除`);
        }
      }

      this.milvus = tempMilvus;
      this.logger.log('Milvus 初始化完成');
    } catch (error) {
      this.logger.error('初始化数据库失败:', error);
      throw error;
    }
  }

  async deleteByFilter(filter: string) {
    try {
      const hasColResp = await this.milvus.client.hasCollection({
        collection_name: this.milvusConfig.collectionName,
      });
      if (!hasColResp.value) {
        this.logger.log(
          `Milvus 集合 ${this.milvusConfig.collectionName} 不存在，跳过删除: ${filter}`,
        );
        return;
      }
      await this.milvus.client.delete({
        collection_name: this.milvusConfig.collectionName,
        filter,
      });
      this.logger.log(`Milvus 删除成功: ${filter}`);
    } catch (error) {
      this.logger.error(`Milvus 删除失败: ${error.message}`);
      throw error;
    }
  }
}

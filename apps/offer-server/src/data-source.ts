import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const isDev = __dirname.includes('src');

const options: DataSourceOptions = {
  type: 'mysql',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: isDev
    ? [__dirname + '/**/*.entity{.ts,.js}']
    : [__dirname + '/**/*.entity.js'],
  migrations: isDev
    ? [__dirname + '/migrations/*{.ts,.js}']
    : [__dirname + '/migrations/*.js'],
  synchronize: false,
  connectorPackage: 'mysql2',
};

export default new DataSource(options);

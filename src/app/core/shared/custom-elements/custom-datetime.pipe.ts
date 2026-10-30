import { Pipe, PipeTransform } from '@angular/core';
import dayjs from 'src/app/core/helpers/dayjs.config';

export interface IDateTimeOpt {
  format?: string;
  get?: 'date' | 'time12' | 'time24' | 'datetime12' | 'datetime24' | 'day' | 'UTC';
}

@Pipe({
  name: 'customDatetime',
})
export class CustomDatetimePipe implements PipeTransform {
  transform(value: string | Date | null | undefined, opt: IDateTimeOpt = {}): string {
    return customDatetime(value, opt);
  }
}

// Every date is stored as a UTC ISO string; this is the one place that turns it into local time
export default function customDatetime(
  value: string | Date | null | undefined,
  opt: IDateTimeOpt = {},
): string {
  if (value === null || value === undefined || value === '') return '';
  const localDateTime = dayjs.utc(value).tz(dayjs.tz.guess());
  if (!localDateTime.isValid()) return 'Invalid Date';

  const { format = '', get = 'datetime12' } = opt;
  if (format) return localDateTime.format(format);

  switch (get) {
    case 'UTC':
      return localDateTime.toISOString();
    case 'date':
      return localDateTime.format('DD MMM YYYY');
    case 'day':
      return localDateTime.format('YYYY-MM-DD');
    case 'time12':
      return localDateTime.format('hh:mm A');
    case 'time24':
      return localDateTime.format('HH:mm');
    case 'datetime24':
      return localDateTime.format('DD MMM YYYY, HH:mm');
    case 'datetime12':
    default:
      return localDateTime.format('DD MMM YYYY, hh:mm A');
  }
}

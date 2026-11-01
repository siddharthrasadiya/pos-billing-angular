import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';

// Google Input Tools (the engine behind Gujarati phone keyboards), free and without a key.
// It writes the same sound in Gujarati letters ("product" -> "પ્રોડક્ટ"), the way people type on
// WhatsApp, instead of translating the meaning ("ઉત્પાદન"). It is unofficial, so any failure or
// offline use returns an empty string and the user types the Gujarati name instead
const TRANSLITERATE_URL = 'https://inputtools.google.com/request';

// Only real words are sent; numbers, units ("1kg", "500ml") and single letters stay as typed
const WORD = /^[a-z]{2,}$/i;

type InputToolsResponse = [string, [string, string[]][]?];

@Injectable({
  providedIn: 'root',
})
export class TranslateService {
  constructor(private http: HttpClient) {}

  // One request per word (sent together), because the service joins a phrase into one result
  toGujarati(text: string): Observable<string> {
    const parts = text.trim().split(/(\s+)/);
    if (!parts.some((p) => WORD.test(p))) return of('');
    return forkJoin(parts.map((p) => (WORD.test(p) ? this.word(p) : of(p)))).pipe(
      map((written) => (written.includes('') ? '' : written.join('').trim())),
    );
  }

  private word(word: string): Observable<string> {
    const params = { itc: 'gu-t-i0-und', num: '1', ie: 'utf-8', oe: 'utf-8', text: word };
    return this.http.get<InputToolsResponse>(TRANSLITERATE_URL, { params }).pipe(
      map(([status, results]) => (status === 'SUCCESS' ? (results?.[0]?.[1]?.[0] ?? '') : '')),
      catchError(() => of('')),
    );
  }
}

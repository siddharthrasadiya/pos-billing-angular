import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';

// Free Google Translate endpoint (no key). It is unofficial, so any failure or offline use
// returns an empty string and the user types the Gujarati name instead
const TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';

@Injectable({
  providedIn: 'root',
})
export class TranslateService {
  constructor(private http: HttpClient) {}

  toGujarati(text: string): Observable<string> {
    const params = { client: 'gtx', sl: 'en', tl: 'gu', dt: 't', q: text };
    return this.http.get<[[string, string][]]>(TRANSLATE_URL, { params }).pipe(
      map((response) => response[0].map((segment) => segment[0]).join('').trim()),
      catchError(() => of('')),
    );
  }
}

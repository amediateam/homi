{{-- An expired call link (WP-43, `410`), in the token's language. --}}
@extends('call.layout')

@section('content')
<p class="note">{{ __('call.expired', [], $locale) }}</p>
@endsection

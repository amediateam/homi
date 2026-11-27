{{-- The call page of a valid token (WP-43): the listing's title (masked), the number and one `tel:` link. --}}
@extends('call.layout')

@section('content')
<h1>{{ __('call.heading', [], $locale) }}</h1>
<p class="title">{{ $title }}</p>
<p class="number">{{ $display }}</p>
<a class="call" href="tel:{{ $phone }}">{{ __('call.call', [], $locale) }}</a>
@endsection

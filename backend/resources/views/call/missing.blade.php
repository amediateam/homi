{{-- A call link that is not HOMI's, of an unknown or withdrawn listing, without a phone or of an erased user (WP-43, `404`). --}}
@extends('call.layout')

@section('content')
<p class="note">{{ __('call.missing', [], $locale) }}</p>
@endsection

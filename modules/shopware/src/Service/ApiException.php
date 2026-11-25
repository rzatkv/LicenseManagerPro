<?php

declare(strict_types=1);

namespace Lmp\LicenseManager\Service;

/**
 * Thrown when the License Manager Pro backend refuses or cannot serve a
 * request. Callers treat this as "no license was minted / no data" and
 * fail closed; the message is safe to log and to show to an admin.
 */
class ApiException extends \RuntimeException
{
}
